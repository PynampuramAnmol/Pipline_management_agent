import { Card, EmptyState, SkeletonRows, StatusBadge } from './common.jsx'
import {
  formatDuration,
  formatNumber,
  formatRate,
  formatStatus,
  formatTime,
  normalizeRate,
  statusTone,
} from '../lib/format.js'

function RateBar({ rate }) {
  if (rate === null) return <span className="muted">n/a</span>
  return (
    <div className="rate">
      <span className="rate-value mono">{formatRate(rate)}</span>
      <span className="rate-track" aria-hidden="true">
        <span className="rate-fill" style={{ width: `${Math.max(0, Math.min(100, rate))}%` }} />
      </span>
    </div>
  )
}

function Sparkline({ statuses }) {
  if (!statuses?.length) return <span className="muted">n/a</span>
  const bad = statuses.filter((s) => ['bad', 'warn'].includes(statusTone(s))).length
  return (
    <span
      className="spark"
      role="img"
      aria-label={`Last ${statuses.length} runs, oldest to newest: ${statuses.map(formatStatus).join(', ')}. ${bad} not successful.`}
    >
      {statuses.map((s, i) => (
        <span key={i} className={`spark-cell spark-${statusTone(s)}`} title={formatStatus(s)} />
      ))}
    </span>
  )
}

export default function PipelinesTable({ jobs, loading, selectedJobId, onSelectJob }) {
  const sorted = [...(jobs || [])].sort(
    (a, b) => (b.failed ?? 0) - (a.failed ?? 0) || (b.runs ?? 0) - (a.runs ?? 0),
  )

  function onKey(e, id) {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault()
      onSelectJob(id)
    }
  }

  return (
    <Card
      title="Pipelines"
      id="pipelines"
      actions={<span className="card-meta">Sorted by failures · select a row to filter runs</span>}
    >
      {loading ? (
        <SkeletonRows rows={4} />
      ) : !sorted.length ? (
        <EmptyState>No pipelines found.</EmptyState>
      ) : (
        <div className="table-wrap">
          <table className="table">
            <thead>
              <tr>
                <th scope="col">Job</th>
                <th scope="col" className="num">Runs</th>
                <th scope="col">Success rate</th>
                <th scope="col" className="num">Failed</th>
                <th scope="col" className="num">Avg duration</th>
                <th scope="col">Last run</th>
                <th scope="col">Last failure</th>
                <th scope="col">Recent runs</th>
              </tr>
            </thead>
            <tbody>
              {sorted.map((job) => {
                const rate = normalizeRate(job.success_rate, job.succeeded, job.runs)
                const selected = String(selectedJobId) === String(job.job_id)
                return (
                  <tr
                    key={job.job_id}
                    className={`row-clickable ${selected ? 'row-selected' : ''}`}
                    tabIndex={0}
                    aria-selected={selected}
                    onClick={() => onSelectJob(job.job_id)}
                    onKeyDown={(e) => onKey(e, job.job_id)}
                    aria-label={`Filter runs to ${job.job_name}`}
                  >
                    <th scope="row" className="cell-job">
                      <span className="job-name">{job.job_name}</span>
                      <span className="job-id mono">{job.job_id}</span>
                    </th>
                    <td className="num mono">{formatNumber(job.runs)}</td>
                    <td><RateBar rate={rate} /></td>
                    <td className={`num mono ${job.failed > 0 ? 'text-bad' : ''}`}>{formatNumber(job.failed)}</td>
                    <td className="num mono">{formatDuration(job.avg_duration_seconds)}</td>
                    <td>{job.last_run ? <StatusBadge status={job.last_run.status} /> : <span className="muted">n/a</span>}</td>
                    <td className="nowrap">
                      {job.last_failure ? formatTime(job.last_failure.started) : <span className="muted">None</span>}
                    </td>
                    <td><Sparkline statuses={job.recent_statuses} /></td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
    </Card>
  )
}
