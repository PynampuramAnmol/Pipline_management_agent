import { isBad, timeValue } from './format.js'

export function parseUpload(text, filename) {
  let input
  try { input = JSON.parse(text) } catch { throw new Error('This file is not valid JSON. Export your runs as a JSON array or an object with a runs array.') }
  const records = Array.isArray(input) ? input : input?.runs
  if (!Array.isArray(records) || !records.length) throw new Error('Add at least one run in a JSON array or a runs array.')
  if (records.length > 10000) throw new Error('Upload up to 10,000 runs at a time.')
  const seen = new Set()
  const runs = records.map((record, index) => {
    const fail = message => { throw new Error(`Run ${index + 1}: ${message}`) }
    if (!record || typeof record !== 'object' || Array.isArray(record)) fail('each run must be an object.')
    for (const key of ['run_id', 'job_id']) {
      if (!['string', 'number'].includes(typeof record[key]) || !String(record[key]).trim()) fail(`${key} is required.`)
    }
    const run_id = String(record.run_id)
    if (seen.has(run_id)) fail('duplicate run_id. Each run needs a unique ID.')
    seen.add(run_id)
    const status = record.status || record.result_state || record.state?.result_state || record.state?.life_cycle_state || record.lifecycle_state
    if (typeof status !== 'string' || !status.trim()) fail('status or result_state is required.')
    const timestamp = key => {
      const value = record[key]
      if (value == null || value === '') return null
      const date = new Date(value)
      if (!['string', 'number'].includes(typeof value) || !Number.isFinite(date.getTime())) fail(`${key} must be an ISO timestamp or milliseconds since epoch.`)
      return date.toISOString()
    }
    const start_time = timestamp('start_time')
    const end_time = timestamp('end_time')
    if (start_time && end_time && end_time < start_time) fail('end_time must follow start_time.')
    const duration = record.duration_seconds ?? (start_time && end_time ? (new Date(end_time) - new Date(start_time)) / 1000 : null)
    if (duration != null && (typeof duration !== 'number' || !Number.isFinite(duration) || duration < 0)) fail('duration_seconds must be a non-negative number.')
    return { run_id, job_id: String(record.job_id), job_name: String(record.job_name || record.pipeline_name || `Job ${record.job_id}`), status: status.trim().toUpperCase().replace(/^TIMEDOUT$/, 'TIMED_OUT').replace(/^CANCELED$/, 'CANCELLED'), start_time, duration_seconds: duration, error_message: String(record.error_message || record.state?.state_message || '') }
  })
  return { source: 'upload', filename, fetched_at: new Date().toISOString(), jobs: [], runs, truncated: false }
}

export function summarizeWorkspace(data) {
  const jobs = [...new Map([...data.jobs, ...data.runs.map(r => ({ job_id: r.job_id, job_name: r.job_name }))].map(j => [j.job_id, j])).values()].map(job => {
    const runs = data.runs.filter(r => r.job_id === job.job_id).sort((a, b) => timeValue(b.start_time) - timeValue(a.start_time))
    const failed = runs.filter(r => isBad(r.status))
    const durations = runs.filter(r => r.duration_seconds != null)
    return { ...job, runs: runs.length, succeeded: runs.filter(r => r.status === 'SUCCESS').length, failed: failed.length,
      success_rate: runs.length ? runs.filter(r => r.status === 'SUCCESS').length / runs.length * 100 : null,
      avg_duration_seconds: durations.length ? durations.reduce((sum, r) => sum + r.duration_seconds, 0) / durations.length : null,
      last_run: runs[0], last_failure: failed[0] ? { started: failed[0].start_time } : null, recent_statuses: runs.slice(0, 10).reverse().map(r => r.status) }
  })
  const durations = data.runs.filter(r => r.duration_seconds != null)
  return { jobs, succeeded: data.runs.filter(r => r.status === 'SUCCESS').length, failed: data.runs.filter(r => isBad(r.status)).length,
    average: durations.length ? durations.reduce((sum, r) => sum + r.duration_seconds, 0) / durations.length : null }
}
