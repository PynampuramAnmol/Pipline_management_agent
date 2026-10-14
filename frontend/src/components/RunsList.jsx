import { useMemo, useState } from 'react'
import { Card, EmptyState, SkeletonRows, StatusBadge } from './common.jsx'
import { formatDuration, formatTime, isBad, timeValue } from '../lib/format.js'

const PAGE = 50
const STATUS_FILTERS = [
  { value: 'all', label: 'All' },
  { value: 'failed', label: 'Failed' },
  { value: 'succeeded', label: 'Succeeded' },
]

export default function RunsList({
  runs,
  jobs,
  loading,
  statusFilter,
  onStatusFilter,
  jobFilter,
  onJobFilter,
  selectedRunId,
  onSelectRun,
}) {
  const [query, setQuery] = useState('')
  const [limit, setLimit] = useState(PAGE)

  const jobOptions = useMemo(() => {
    const map = new Map()
    for (const j of jobs || []) map.set(String(j.job_id), j.job_name)
    for (const r of runs || []) if (!map.has(String(r.job_id))) map.set(String(r.job_id), r.job_name)
    return [...map.entries()].sort((a, b) => String(a[1]).localeCompare(String(b[1])))
  }, [jobs, runs])

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    return (runs || [])
      .filter((r) => {
        if (statusFilter === 'failed' && !isBad(r.status)) return false
        if (statusFilter === 'succeeded' && String(r.status).toUpperCase() !== 'SUCCESS') return false
        if (jobFilter && String(r.job_id) !== String(jobFilter)) return false
        if (q && !String(r.run_id).toLowerCase().includes(q)) return false
        return true
      })
      .sort((a, b) => timeValue(b.start_time) - timeValue(a.start_time))
  }, [runs, statusFilter, jobFilter, query])

  const visible = filtered.slice(0, limit)

  function onKey(e, run) {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault()
      onSelectRun(run.run_id)
    }
  }

  return (
    <Card
      title="Runs"
      id="runs"
      actions={
        !loading && (
          <span className="card-meta" aria-live="polite">
            {filtered.length.toLocaleString()} of {(runs || []).length.toLocaleString()} runs
          </span>
        )
      }
    >
      <div className="filters" role="group" aria-label="Filter runs">
        <div className="segmented" role="radiogroup" aria-label="Status">
          {STATUS_FILTERS.map((f) => (
            <button
              key={f.value}
              type="button"
              role="radio"
              aria-checked={statusFilter === f.value}
              className={`segment ${statusFilter === f.value ? 'segment-active' : ''}`}
              onClick={() => {
                onStatusFilter(f.value)
                setLimit(PAGE)
              }}
            >
              {f.label}
            </button>
          ))}
        </div>
        <label className="field">
          <span className="sr-only">Job</span>
          <select
            value={jobFilter ?? ''}
            onChange={(e) => {
              onJobFilter(e.target.value || null)
              setLimit(PAGE)
            }}
          >
            <option value="">All jobs</option>
            {jobOptions.map(([id, name]) => (
              <option key={id} value={id}>
                {name}
              </option>
            ))}
          </select>
        </label>
        <label className="field field-grow">
          <span className="sr-only">Search by run ID</span>
          <input
            type="search"
            inputMode="numeric"
            placeholder="Search run ID"
            value={query}
            onChange={(e) => {
              setQuery(e.target.value)
              setLimit(PAGE)
            }}
          />
        </label>
      </div>

      {loading ? (
        <SkeletonRows rows={6} />
      ) : !filtered.length ? (
        <EmptyState>
          {(runs || []).length ? 'No runs match these filters.' : 'No runs on record yet.'}
        </EmptyState>
      ) : (
        <>
          <div className="table-wrap">
            <table className="table">
              <caption className="sr-only">
                Runs. Failed runs can be opened with Enter to show the incident report.
              </caption>
              <thead>
                <tr>
                  <th scope="col">Job</th>
                  <th scope="col">Run ID</th>
                  <th scope="col">Status</th>
                  <th scope="col">Started</th>
                  <th scope="col" className="num">Duration</th>
                </tr>
              </thead>
              <tbody>
                {visible.map((run) => {
                  const clickable = isBad(run.status)
                  const selected = String(selectedRunId) === String(run.run_id)
                  return (
                    <tr
                      key={run.run_id}
                      data-run-id={run.run_id}
                      className={`${clickable ? 'row-clickable row-failed' : ''} ${selected ? 'row-selected' : ''}`}
                      {...(clickable
                        ? {
                            tabIndex: 0,
                            onClick: () => onSelectRun(run.run_id),
                            onKeyDown: (e) => onKey(e, run),
                            'aria-label': `Open incident report for run ${run.run_id}, ${run.job_name}`,
                            'aria-current': selected ? 'true' : undefined,
                          }
                        : {})}
                    >
                      <td className="cell-job-sm">{run.job_name}</td>
                      <td className="mono">{run.run_id}</td>
                      <td><StatusBadge status={run.status} /></td>
                      <td className="nowrap">{formatTime(run.start_time)}</td>
                      <td className="num mono">
                        {run.duration_seconds != null
                          ? formatDuration(run.duration_seconds)
                          : run.duration_formatted || 'n/a'}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
          {filtered.length > limit && (
            <div className="table-foot">
              <button type="button" className="btn btn-sm" onClick={() => setLimit((l) => l + PAGE)}>
                Show {Math.min(PAGE, filtered.length - limit)} more
              </button>
            </div>
          )}
        </>
      )}
    </Card>
  )
}
