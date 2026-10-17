import { forwardRef } from 'react'
import useSWR from 'swr'
import { fetcher, downloadText } from '../lib/api.js'
import { Card, CopyButton, EmptyState, Mono, Skeleton, StatusBadge } from './common.jsx'
import { formatDuration, formatTime, isBad, statusTone } from '../lib/format.js'

function depName(d) {
  if (d && typeof d === 'object') return d.task_key || d.task || JSON.stringify(d)
  return String(d)
}

function Field({ label, children }) {
  return (
    <div className="field-row">
      <dt>{label}</dt>
      <dd>{children}</dd>
    </div>
  )
}

function JobCard({ job, run }) {
  return (
    <Card title="Pipeline / job" className="report-card">
      <dl className="field-list">
        <Field label="Job">
          {job?.name || 'n/a'} <Mono>({job?.id ?? 'n/a'})</Mono>
        </Field>
        <Field label="Run ID"><Mono>{run?.id ?? 'n/a'}</Mono></Field>
        <Field label="Status">
          <span className="inline-gap">
            <StatusBadge status={run?.status} />
            {run?.lifecycle && <span className="muted mono">{run.lifecycle}</span>}
          </span>
        </Field>
        <Field label="Started">{formatTime(run?.started)}</Field>
        <Field label="Ended">{formatTime(run?.ended)}</Field>
        <Field label="Duration"><Mono>{formatDuration(run?.duration)}</Mono></Field>
        {run?.queued !== null && run?.queued !== undefined && (
          <Field label="Queued"><Mono>{formatDuration(run.queued)}</Mono></Field>
        )}
        <Field label="Data source">{run?.source || 'n/a'}</Field>
      </dl>
    </Card>
  )
}

function ReasonCard({ failure }) {
  const recorded = failure?.reason_recorded && failure?.reason
  return (
    <Card
      title="Reason for failure"
      className="report-card reason-card"
      actions={recorded ? <CopyButton text={failure.reason} label="Copy error" /> : null}
    >
      {failure?.type && <span className="chip">{failure.type}</span>}
      {recorded ? (
        <pre className="error-block" tabIndex={0} aria-label="Error message">
          {failure.reason}
        </pre>
      ) : (
        <p className="note">No error text was recorded for this run.</p>
      )}
    </Card>
  )
}

function TasksCard({ tasks, skipped }) {
  return (
    <Card title="Task breakdown" className="report-card report-wide">
      {!tasks?.length ? (
        <EmptyState>No task details were returned for this run.</EmptyState>
      ) : (
        <div className="table-wrap">
          <table className="table">
            <thead>
              <tr>
                <th scope="col">Task</th>
                <th scope="col">State</th>
                <th scope="col" className="num">Attempts</th>
                <th scope="col" className="num">Duration</th>
                <th scope="col">Depends on</th>
              </tr>
            </thead>
            <tbody>
              {tasks.map((t) => {
                const failed = isBad(t.state)
                const retries = (t.attempts ?? 1) - 1
                return (
                  <tr key={t.task} className={failed ? 'row-failed-static' : ''}>
                    <th scope="row" className="mono task-name">{t.task}</th>
                    <td><StatusBadge status={t.state} /></td>
                    <td className="num">
                      <span className="mono">{t.attempts ?? 'n/a'}</span>
                      {retries > 0 && (
                        <span className="retry-note">retried {retries} {retries === 1 ? 'time' : 'times'}</span>
                      )}
                    </td>
                    <td className="num mono">{formatDuration(t.duration)}</td>
                    <td>
                      {t.depends_on?.length ? (
                        <span className="deps">
                          {t.depends_on.map((d) => (
                            <span key={depName(d)} className="dep mono">{depName(d)}</span>
                          ))}
                        </span>
                      ) : (
                        <span className="muted">None</span>
                      )}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
      {tasks?.some((t) => isBad(t.state) && t.error) && (
        <div className="task-errors">
          <h3 className="subhead">Task errors</h3>
          {tasks
            .filter((t) => isBad(t.state) && t.error)
            .map((t) => (
              <div key={t.task} className="task-error">
                <span className="mono task-error-name">{t.task}</span>
                <pre className="error-block error-block-sm">{t.error}</pre>
              </div>
            ))}
        </div>
      )}
      <div className="skipped">
        <h3 className="subhead">Not run because of this failure</h3>
        {skipped?.length ? (
          <ul className="dep-list">
            {skipped.map((s) => (
              <li key={depName(s)} className="dep mono">{depName(s)}</li>
            ))}
          </ul>
        ) : (
          <p className="muted small">No downstream tasks were skipped.</p>
        )}
      </div>
    </Card>
  )
}

function HistoryCard({ history }) {
  if (!history) {
    return (
      <Card title="Job history" className="report-card">
        <EmptyState>No history returned.</EmptyState>
      </Card>
    )
  }
  const sameIds = history.same_error_run_ids || []
  const others = history.other_failures || []
  return (
    <Card title="Job history" className="report-card">
      <dl className="field-list">
        <Field label="Runs on record"><Mono>{history.runs ?? 'n/a'}</Mono></Field>
        <Field label="Succeeded / failed">
          <span className="mono">
            <span className="text-ok">{history.succeeded ?? 'n/a'}</span>
            {' / '}
            <span className={history.failed > 0 ? 'text-bad' : ''}>{history.failed ?? 'n/a'}</span>
          </span>
        </Field>
        <Field label="Last success before this run">
          {history.last_success ? (
            <>
              {formatTime(history.last_success.started)} <Mono>({history.last_success.run_id})</Mono>
            </>
          ) : (
            <span className="muted">None on record</span>
          )}
        </Field>
        <Field label="Same error seen before">
          {history.same_error_before && sameIds.length ? (
            <span>
              {sameIds.length} earlier {sameIds.length === 1 ? 'run' : 'runs'}:{' '}
              <span className="deps">
                {sameIds.map((id) => <span key={id} className="dep mono">{id}</span>)}
              </span>
            </span>
          ) : history.same_error_before ? (
            'Yes'
          ) : (
            <span className="muted">No earlier runs with this error</span>
          )}
        </Field>
      </dl>
      <h3 className="subhead">Other failures in this job</h3>
      {others.length ? (
        <ul className="history-list">
          {others.map((f) => (
            <li key={f.run_id}>
              <Mono>{f.run_id}</Mono>
              <span className="muted">{formatTime(f.started)}</span>
            </li>
          ))}
        </ul>
      ) : (
        <p className="muted small">No other failures on record.</p>
      )}
    </Card>
  )
}


function InsightsCard({ runId }) {
  const { data, error, isLoading } = useSWR(
    runId ? `/api/report/${encodeURIComponent(runId)}/insights` : null,
    fetcher,
  )
  const body = () => {
    if (error) {
      return <p className="note">{error.unreachable ? 'Backend unreachable.' : `Could not load insights: ${error.message}`}</p>
    }
    if (isLoading || !data) {
      return <div aria-busy="true"><Skeleton height={14} width="50%" /><Skeleton height={48} /></div>
    }
    if (data.status !== 'ok') {
      return <EmptyState>{data.note || 'No insights available.'}</EmptyState>
    }
    return (
      <>
        <dl className="field-list">
          <Field label="Category">
            {data.category ? (
              <span className="inline-gap">
                <span className="chip">{String(data.category.value).replace(/_/g, ' ')}</span>
                <span className="muted small">
                  {data.category.basis === 'linked_document' ? 'document linked to this run' : 'by similarity'}
                  {' · '}<Mono>{data.category.doc_id}</Mono>
                  {' · '}<Mono>score {Number(data.category.score).toFixed(3)}</Mono>
                </span>
              </span>
            ) : (
              <span className="muted">Unclassified: no document matched above the cutoff</span>
            )}
          </Field>
          <Field label="Novelty">
            {data.novelty?.novel ? (
              <span className="inline-gap">
                <span className="chip chip-warn">new pattern</span>
                <span className="muted small">{data.novelty.note}</span>
              </span>
            ) : (
              <span className="muted">{data.novelty?.note || 'n/a'}</span>
            )}
            {data.novelty?.best_score != null && (
              <span className="muted small mono"> best score {Number(data.novelty.best_score).toFixed(3)}</span>
            )}
          </Field>
        </dl>
        <h3 className="subhead">Suggested checks (quoted from runbooks)</h3>
        {data.checks?.length ? (
          <ul className="ref-list">
            {data.checks.map((c) => (
              <li key={`${c.doc_id}-${c.text}`} className="ref-item">
                <p className="ref-snippet ref-check">{c.text}</p>
                <div className="muted small">
                  <Mono>{c.doc_id}</Mono> {c.title}
                  {c.source === 'mock' ? ' · mock sample' : ''} · <Mono>score {Number(c.score).toFixed(3)}</Mono>
                </div>
              </li>
            ))}
          </ul>
        ) : (
          <p className="muted small">No runbook matched above the cutoff.</p>
        )}
        <p className="muted small">{data.note}</p>
      </>
    )
  }
  return (
    <Card title="RAG insights (retrieved, not a diagnosis)" className="report-card">
      {body()}
    </Card>
  )
}

function ReferencesCard({ runId }) {
  const { data, error, isLoading } = useSWR(
    runId ? `/api/report/${encodeURIComponent(runId)}/references` : null,
    fetcher,
  )
  return (
    <Card title="Similar past documents (retrieved, not a diagnosis)" className="report-card report-wide">
      {error ? (
        <p className="note">
          {error.unreachable ? 'Backend unreachable.' : `Could not load reference documents: ${error.message}`}
        </p>
      ) : isLoading || !data ? (
        <div aria-busy="true">
          <Skeleton height={14} width="60%" />
          <Skeleton height={48} />
        </div>
      ) : !data.items?.length ? (
        <EmptyState>
          {data.status === 'no_error_text'
            ? 'No error text was recorded, so there was nothing to search with.'
            : data.status === 'unavailable'
              ? data.note
              : 'No similar documents passed the relevance cutoff.'}
        </EmptyState>
      ) : (
        <ul className="ref-list">
          {data.items.map((d) => (
            <li key={d.chunk_id} className="ref-item">
              <div className="ref-head">
                <Mono>{d.doc_id}</Mono>
                <span className="ref-title">{d.title}</span>
                <span className="chip">{String(d.doc_type).replace(/_/g, ' ')}</span>
                <span className={`chip ${d.source === 'mock' ? 'chip-sample' : ''}`}>
                  {d.source === 'mock' ? 'mock sample' : d.source}
                </span>
                {d.linked_to_run && <span className="chip">linked to this run</span>}
                <span className="muted mono ref-score" title="Cosine similarity, not a probability">
                  score {Number(d.score).toFixed(3)}
                </span>
              </div>
              <p className="ref-snippet">{d.snippet}</p>
            </li>
          ))}
        </ul>
      )}
      {data?.note && <p className="muted small">{data.note}</p>}
    </Card>
  )
}

const IncidentReport = forwardRef(function IncidentReport({ runId, onClose }, ref) {
  const { data, error, isLoading } = useSWR(runId ? `/api/report/${encodeURIComponent(runId)}` : null, fetcher)
  const status = data?.run?.status || 'FAILED'
  const tone = statusTone(status)

  return (
    <section className="report" ref={ref} tabIndex={-1} aria-labelledby="report-title">
      <div className={`report-bar report-bar-${tone}`}>
        <div className="report-heading">
          <h2 id="report-title">
            Incident report
            <span className="report-sub">
              {data?.job?.name ? `${data.job.name} · ` : ''}
              <Mono>run {runId}</Mono>
            </span>
          </h2>
          <StatusBadge status={status} />
        </div>
        <div className="report-actions">
          <button
            type="button"
            className="btn btn-sm"
            disabled={!data?.markdown}
            onClick={() => downloadText(`incident-${runId}.md`, data.markdown)}
          >
            Download .md
          </button>
          <CopyButton text={data?.markdown} />
          <button type="button" className="btn btn-sm btn-ghost" onClick={onClose} aria-label="Close incident report">
            Close
          </button>
        </div>
      </div>

      {error ? (
        <div className="banner banner-error" role="alert">
          {error.unreachable
            ? 'Backend unreachable, is `python server.py` running?'
            : `Could not load the report: ${error.message}`}
        </div>
      ) : isLoading || !data ? (
        <div className="report-grid" aria-busy="true">
          {Array.from({ length: 3 }, (_, i) => (
            <div className="card" key={i}>
              <Skeleton height={14} width="40%" />
              <Skeleton height={120} />
            </div>
          ))}
        </div>
      ) : (
        <div className="report-grid">
          <JobCard job={data.job} run={data.run} />
          <ReasonCard failure={data.failure} />
          <TasksCard tasks={data.tasks} skipped={data.skipped_tasks} />
          <HistoryCard history={data.history} />
          <InsightsCard runId={runId} />
          <ReferencesCard runId={runId} />
        </div>
      )}
    </section>
  )
})

export default IncidentReport
