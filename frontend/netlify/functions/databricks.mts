// Credentials are used only within this request and are never persisted or logged.
export default async function handler(request: Request) {
  const reply = (body: object, status = 200) => Response.json(body, { status, headers: { 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' } });
  if (request.method !== 'POST') return reply({ error: 'Use POST to connect.' }, 405);
  if (request.headers.get('origin') && request.headers.get('origin') !== new URL(request.url).origin) return reply({ error: 'Request origin is not allowed.' }, 403);
  if (!request.headers.get('content-type')?.includes('application/json')) return reply({ error: 'Send a JSON request.' }, 415);
  let body;
  try { body = await request.json(); } catch { return reply({ error: 'Invalid connection details.' }, 400); }
  let workspace: URL;
  try {
    workspace = new URL(body.host);
    const allowed = /^(?:[a-z0-9-]+\.)+(?:cloud\.databricks\.com|azuredatabricks\.net|gcp\.databricks\.com)$/i;
    if (workspace.protocol !== 'https:' || !allowed.test(workspace.hostname) || workspace.port || workspace.username || workspace.password || workspace.search || workspace.hash || workspace.pathname !== '/') throw new Error();
  } catch { return reply({ error: 'Enter your HTTPS Databricks workspace URL without a path (AWS, Azure, or GCP).' }, 400); }
  if (typeof body.token !== 'string' || !body.token.trim() || body.token.length > 4096 || /[\r\n]/.test(body.token)) return reply({ error: 'Enter a valid Databricks personal access token.' }, 400);
  const token = body.token.trim();
  const signal = AbortSignal.timeout(25000);
  async function collect(kind: 'jobs' | 'runs') {
    const items: any[] = [];
    let pageToken = '';
    let more = false;
    for (let page = 0; page < 4; page++) {
      const url = new URL(kind === 'jobs' ? '/api/2.2/jobs/list' : '/api/2.2/jobs/runs/list', workspace);
      url.searchParams.set('limit', '25');
      if (pageToken) url.searchParams.set('page_token', pageToken);
      const response = await fetch(url, { headers: { Authorization: `Bearer ${token}` }, redirect: 'error', signal });
      if (!response.ok) throw { upstream: response.status };
      const data = await response.json();
      if (data[kind] !== undefined && !Array.isArray(data[kind])) throw new Error();
      items.push(...(data[kind] || []));
      pageToken = data.next_page_token || '';
      more = Boolean(pageToken || data.has_more);
      if (!pageToken) break;
    }
    return { items, more };
  }
  try {
    const [jobs, runs] = await Promise.all([collect('jobs'), collect('runs')]);
    const names = new Map(jobs.items.map(job => [String(job.job_id), job.settings?.name || `Job ${job.job_id}`]));
    // Only return the fields displayed by the dashboard, never upstream response bodies.
    const safe = (value: unknown) => typeof value === 'string' ? value.split(token).join('[redacted]') : '';
    return reply({
      host: workspace.origin,
      fetched_at: new Date().toISOString(),
      truncated: jobs.more || runs.more,
      jobs: jobs.items.map(job => ({ job_id: String(job.job_id), job_name: safe(names.get(String(job.job_id))) })),
      runs: runs.items.map(run => ({
        run_id: String(run.run_id), job_id: String(run.job_id),
        job_name: safe(names.get(String(run.job_id)) || `Job ${run.job_id}`),
        status: safe(run.state?.result_state || run.state?.life_cycle_state || 'UNKNOWN').replace(/^TIMEDOUT$/, 'TIMED_OUT').replace(/^CANCELED$/, 'CANCELLED'),
        start_time: run.start_time > 0 ? new Date(run.start_time).toISOString() : null,
        duration_seconds: run.end_time > run.start_time && run.start_time > 0 ? (run.end_time - run.start_time) / 1000 : null,
        error_message: safe(run.state?.state_message),
      })),
    });
  } catch (error: any) {
    const status = error?.upstream;
    const message = status === 401 ? 'Databricks rejected this token. Check that it is valid and belongs to this workspace.'
      : status === 403 ? 'This token does not have permission to read jobs and runs in this workspace.'
      : status === 429 ? 'Databricks is rate limiting requests. Try again shortly.'
      : 'Could not read this workspace. Check the URL, workspace network access, and try again.';
    return reply({ error: message }, status === 401 || status === 403 || status === 429 ? status : 502);
  }
}
