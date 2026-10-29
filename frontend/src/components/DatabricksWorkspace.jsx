import { useEffect, useMemo, useRef, useState } from 'react'
import { Card, StatusBadge } from './common.jsx'
import PipelinesTable from './PipelinesTable.jsx'
import RunsList from './RunsList.jsx'
import WorkspaceNav, { WorkspaceIcon } from './WorkspaceNav.jsx'
import { parseUpload, summarizeWorkspace } from '../lib/workspace-data.js'
import { formatDuration, formatRate } from '../lib/format.js'

const example = '[\n  {\n    "job_id": "orders",\n    "job_name": "Orders ingest",\n    "run_id": "run-1",\n    "status": "SUCCESS",\n    "start_time": "2026-10-29T08:00:00Z",\n    "duration_seconds": 120\n  }\n]'

export default function DatabricksWorkspace() {
  const [mode, setMode] = useState('api')
  const [host, setHost] = useState('')
  const [token, setToken] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [data, setData] = useState(null)
  const [active, setActive] = useState('overview')
  const [jobFilter, setJobFilter] = useState(null)
  const [statusFilter, setStatusFilter] = useState('all')
  const [selected, setSelected] = useState(null)
  const reportRef = useRef(null)
  const contentRef = useRef(null)
  const summary = useMemo(() => data ? summarizeWorkspace(data) : null, [data])

  useEffect(() => {
    // Old demo links now lead to the connection screen.
    if (['#demo', '#workspace'].includes(window.location.hash)) window.history.replaceState(null, '', window.location.pathname + window.location.search)
  }, [])
  useEffect(() => {
    if (selected) { reportRef.current?.scrollIntoView({ block: 'center', behavior: 'instant' }); reportRef.current?.focus({ preventScroll: true }) }
  }, [selected])
  useEffect(() => {
    if (data) { window.scrollTo(0, 0); contentRef.current?.focus({ preventScroll: true }) }
  }, [active, data])

  function navigate(page) { setActive(page); setSelected(null) }
  function applyData(result) {
    setData(result); setSelected(null); setJobFilter(null); setStatusFilter('all'); setActive('overview'); setError('')
  }
  function disconnect() {
    setData(null); setSelected(null); setToken(''); setHost(''); setError(''); setActive('overview'); setJobFilter(null); setStatusFilter('all'); window.scrollTo(0, 0)
  }
  async function connect(event) {
    event.preventDefault(); setBusy(true); setError('')
    try {
      const pending = fetch('/.netlify/functions/databricks', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ host: host.trim(), token }), cache: 'no-store',
      })
      setToken('')
      const response = await pending
      if (response.status === 404) throw new Error('The Databricks connection service is not deployed. Please try again after the site is redeployed, or use JSON upload.')
      if (!response.headers.get('content-type')?.includes('application/json')) throw new Error('The connection service returned an unexpected response. Please try again after the site is redeployed, or use JSON upload.')
      const result = await response.json()
      if (!response.ok) throw new Error(result.error || 'Connection failed. Please try again.')
      applyData({ ...result, source: 'api' })
    } catch (err) {
      setError(err instanceof SyntaxError || err instanceof TypeError ? 'Connection unavailable. Please try again.' : err.message)
    } finally { setBusy(false); setToken('') }
  }
  async function upload(event) {
    event.preventDefault()
    const file = new FormData(event.currentTarget).get('telemetry')
    if (!file?.size) { setError('Choose a JSON file containing your runs.'); return }
    if (file.size > 5 * 1024 * 1024) { setError('Choose a file smaller than 5 MB.'); return }
    setBusy(true); setError('')
    try { applyData(parseUpload(await file.text(), file.name)) } catch (err) { setError(err.message) } finally { setBusy(false) }
  }
  const connection = <>
    <div className="source-choices" role="tablist" aria-label="Choose how to access your dashboard">
      {[['api', 'connection', '01', 'Connect Databricks API', 'Read your jobs and recent runs using a personal access token.'], ['upload', 'upload', '02', 'Upload a JSON file', 'Explore exported run data. No API token or backend required.']].map(([id, icon, number, title, text]) => <button key={id} id={`source-tab-${id}`} type="button" role="tab" aria-selected={mode === id} aria-controls={`source-panel-${id}`} tabIndex={mode === id ? 0 : -1} disabled={busy} className={`source-choice ${mode === id ? 'is-selected' : ''}`} onClick={() => { setMode(id); setError(''); setToken('') }} onKeyDown={e => { if (['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(e.key)) { e.preventDefault(); const next = e.key === 'Home' ? 'api' : e.key === 'End' ? 'upload' : mode === 'api' ? 'upload' : 'api'; setMode(next); setError(''); setToken(''); document.getElementById(`source-tab-${next}`)?.focus() } }}><span className="source-choice-top"><WorkspaceIcon name={icon} size={24} /><span>{number}</span></span><strong>{title}</strong><span>{text}</span><span className="source-choice-state">{mode === id ? 'Selected' : 'Choose this option'} <span aria-hidden="true">→</span></span></button>)}
    </div>
    <section role="tabpanel" id={`source-panel-${mode}`} aria-labelledby={`source-tab-${mode}`} tabIndex={0}>
      <Card title={mode === 'api' ? 'Connect to your workspace' : 'Upload your run telemetry'} id="source-form">
        {mode === 'api' ? <form className="connection-form" onSubmit={connect} autoComplete="off" aria-busy={busy}>
          <label className="field">Workspace URL<input type="url" value={host} onChange={e => setHost(e.target.value)} required placeholder="https://dbc-your-workspace.cloud.databricks.com" disabled={busy} aria-describedby="connection-help" /></label>
          <label className="field">Personal access token<input type="password" value={token} onChange={e => setToken(e.target.value)} autoComplete="off" required maxLength={4096} disabled={busy} aria-describedby="connection-help" /></label>
          <p id="connection-help" className="muted">Find your token in Databricks Settings → Developer → Access tokens. Use permission to read jobs and runs. Your token is cleared after submission and never saved. Re-enter it to refresh.</p>
          <div className="connection-actions"><button className="btn btn-primary" disabled={busy}>{busy ? 'Reading workspace…' : 'Connect and open dashboard'}<span aria-hidden="true">→</span></button></div>
        </form> : <form className="connection-form upload-form" onSubmit={upload} aria-busy={busy}>
          <label className="upload-dropzone"> <WorkspaceIcon name="upload" size={30} /><strong>Choose your run data</strong><span>JSON files · Up to 5 MB and 10,000 runs</span><input type="file" name="telemetry" accept=".json,application/json" required disabled={busy} aria-label="Choose JSON file" /></label>
          <p className="muted">Your file stays in this browser tab. Upload a JSON array or an object with a <code>runs</code> array. Each run needs <code>job_id</code>, <code>run_id</code>, and <code>status</code> or <code>result_state</code>. ISO timestamps and Databricks millisecond timestamps are supported.</p>
          <details><summary>View the JSON format</summary><pre className="upload-example">{example}</pre></details>
          <div className="connection-actions"><button className="btn btn-primary" disabled={busy}>{busy ? 'Reading file…' : 'Upload and open dashboard'}<span aria-hidden="true">→</span></button></div>
        </form>}
        {error && <p className="source-feedback inline-error" role="alert">{error}</p>}
        {busy && <p className="source-feedback muted" role="status">{mode === 'api' ? 'Fetching jobs and recent runs…' : 'Validating your run data…'}</p>}
      </Card>
    </section>
  </>
  const pipelines = summary && <PipelinesTable jobs={summary.jobs} selectedJobId={jobFilter} onSelectJob={id => { setJobFilter(current => current === id ? null : id); navigate('runs') }} />
  const runs = summary && <RunsList runs={data.runs} jobs={summary.jobs} statusFilter={statusFilter} onStatusFilter={setStatusFilter} jobFilter={jobFilter} onJobFilter={setJobFilter} selectedRunId={selected?.run_id} onSelectRun={id => setSelected(data.runs.find(r => r.run_id === id))} />

  if (!data) return <div className="access-page">
    <header className="access-header"><span className="workspace-brand"><span className="workspace-brand-mark"><WorkspaceIcon name="pipelines" /></span>PipeSage</span><span className="access-tag">PIPELINE OBSERVABILITY</span></header>
    <main className="access-main"><div className="access-intro"><p className="demo-eyebrow">YOUR DATA / YOUR NEXT STEP</p><h1>Connect your data.<br /><em>See the full picture.</em></h1><p>Choose how to open your dashboard.</p></div>{connection}<p className="access-footer">Read-only insights. Your credentials and uploaded files are never saved.</p></main>
  </div>

  return <div className="workspace-layout">
    <a className="skip-workspace" href="#workspace-content">Skip to dashboard content</a>
    <WorkspaceNav active={active} onNavigate={navigate} onDisconnect={disconnect} source={data.source} />
    <div className="workspace-body"><header className="workspace-topbar"><span><span className="workspace-breadcrumb">Workspace / </span>{{ overview: 'Overview', pipelines: 'Pipelines', runs: 'Run history', connection: 'Data source' }[active]}</span><span className={`badge ${data.source === 'upload' ? 'badge-neutral' : 'badge-ok'}`}>{data.source === 'upload' ? 'Uploaded data' : 'Databricks connected'}</span></header>
      <main className="workspace-content" id="workspace-content" tabIndex={-1} ref={contentRef}>
        <div className="workspace-page-heading"><div><p className="demo-eyebrow">{data.source === 'upload' ? 'FILE WORKSPACE' : 'DATABRICKS WORKSPACE'}</p><h1>{{ overview: 'Pipeline overview', pipelines: 'Your pipelines', runs: 'Run history', connection: 'Manage your data source' }[active]}</h1><p className="muted workspace-source-name">{data.source === 'upload' ? data.filename : data.host}</p></div><button className="btn btn-secondary" onClick={() => { setMode(data.source); navigate('connection') }}>{data.source === 'upload' ? 'Replace file' : 'Refresh connection'}</button></div>
        {active === 'connection' ? <>{connection}<p className="muted">Opening a new source replaces the current snapshot. <button className="btn btn-ghost btn-sm" onClick={disconnect}>Disconnect and clear data</button></p></> : <>
          {active === 'overview' && <><div className="workspace-metrics" aria-label="Snapshot metrics">{[['Pipelines', summary.jobs.length, 'Jobs in this snapshot'], ['Total runs', data.runs.length, `${summary.succeeded} succeeded`], ['Failed runs', summary.failed, 'Includes timeout and cancellation'], ['Average duration', formatDuration(summary.average), 'Runs with a recorded duration']].map(([label, value, note]) => <div className="workspace-metric" key={label}><span>{label}</span><strong className={label === 'Failed runs' && value > 0 ? 'text-bad' : ''}>{value}</strong><small>{note}</small></div>)}</div><div className="workspace-summary"><div><span className="demo-eyebrow">SUCCESS RATE</span><strong>{data.runs.length ? formatRate(summary.succeeded / data.runs.length * 100) : 'n/a'}</strong></div><p>Metrics reflect {data.source === 'upload' ? 'the uploaded file' : 'the fetched runs'}.<br />Snapshot opened {new Date(data.fetched_at).toLocaleString()}.</p></div>{pipelines}</>}
          {data.truncated && <p className="demo-notice">More records exist. Showing up to 100 jobs and 100 recent runs; metrics cover this snapshot only.</p>}
          {active === 'pipelines' && pipelines}
          {active === 'runs' && runs}
          {selected && <div ref={reportRef} tabIndex={-1}><Card title={`Run details · ${selected.run_id}`} id="run-details" actions={<button className="btn btn-ghost" onClick={() => setSelected(null)}>Close details</button>}><div className="connection-form"><h3>{selected.job_name}</h3><StatusBadge status={selected.status} /><p>Recorded state message:</p><pre className="connection-error">{selected.error_message || 'No error message was recorded for this run.'}</pre></div></Card></div>}
        </>}
      </main>
    </div>
  </div>
}
