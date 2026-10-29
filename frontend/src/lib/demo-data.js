// Fictional, bundled examples for the public demo. Never sent to the backend.
const definitions = [
  { id: 'orders', name: 'Orders · daily ingestion', durations: [193, 208, 187, 642], error: 'ExecutorLostFailure: executor exceeded available memory.', cause: 'The largest input partition exceeded executor memory during the orders join.', action: 'Inspect partition sizes, repartition the skewed join key, and validate memory usage on a small replay.', reference: 'Example runbook · Spark executor memory' },
  { id: 'inventory', name: 'Inventory · warehouse sync', durations: [87, 94, 91, 89] },
  { id: 'revenue', name: 'Revenue · reporting refresh', durations: [312, 298, 324, 600], error: 'TimeoutException: upstream table was not ready within 600 seconds.', cause: 'The reporting job started before the orders dataset was available.', action: 'Check the upstream orders run, add a task dependency, and retry reporting after the upstream job succeeds.', reference: 'Example runbook · Upstream dependencies' },
]

export const demoRuns = definitions.flatMap((job, j) => job.durations.map((duration, i) => ({
  run_id: String(84210 + j * 10 + i), job_id: job.id, job_name: job.name,
  start_time: `2026-10-${String(23 + i).padStart(2, '0')}T08:${String(j * 15).padStart(2, '0')}:00Z`,
  duration_seconds: duration,
  status: i === 3 && job.error ? (job.id === 'revenue' ? 'TIMED_OUT' : 'FAILED') : 'SUCCESS',
  ...(i === 3 && job.error ? { report: job } : {}),
})))

export const demoJobs = definitions.map(job => {
  const runs = demoRuns.filter(run => run.job_id === job.id)
  const failed = runs.filter(run => run.status !== 'SUCCESS')
  return {
    job_id: job.id, job_name: job.name, runs: runs.length, failed: failed.length,
    succeeded: runs.length - failed.length, success_rate: (runs.length - failed.length) / runs.length * 100,
    avg_duration_seconds: runs.reduce((sum, run) => sum + run.duration_seconds, 0) / runs.length,
    last_run: runs.at(-1), last_failure: failed.length ? { started: failed.at(-1).start_time } : null,
    recent_statuses: runs.map(run => run.status),
  }
})

export const demoOverall = {
  runs: demoRuns.length, succeeded: 10, failed: 2, success_rate: 100 * 10 / 12,
  avg_duration_seconds: demoRuns.reduce((sum, run) => sum + run.duration_seconds, 0) / demoRuns.length,
  max_duration_seconds: Math.max(...demoRuns.map(run => run.duration_seconds)),
}
