import { useEffect, useRef, useState } from 'react'
import KpiRow from './KpiRow.jsx'
import PipelinesTable from './PipelinesTable.jsx'
import RunsList from './RunsList.jsx'
import { Card } from './common.jsx'
import { downloadText } from '../lib/api.js'
import { demoJobs, demoOverall, demoRuns } from '../lib/demo-data.js'

export default function Demo({ onStart }) {
  const [jobFilter, setJobFilter] = useState(null)
  const [statusFilter, setStatusFilter] = useState('all')
  const [selectedRunId, setSelectedRunId] = useState(null)
  const reportRef = useRef(null)
  const selected = demoRuns.find(run => run.run_id === selectedRunId)
  useEffect(() => {
    if (selectedRunId) {
      reportRef.current?.scrollIntoView({ behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth', block: 'center' })
      reportRef.current?.focus({ preventScroll: true })
    }
  }, [selectedRunId])

  function inspectIncident() {
    setJobFilter(null)
    setStatusFilter('failed')
    setSelectedRunId('84213')
  }

  const reportText = selected?.report ? `# DEMO incident · ${selected.run_id}\n\nFictional example, not a live diagnosis.\n\n${selected.report.error}\n\nLikely cause: ${selected.report.cause}\n\nRecommended next step: ${selected.report.action}\n\n${selected.report.reference}` : ''

  return (
    <div className="app demo-page">
      <header className="demo-nav">
        <a href="#demo" className="demo-brand" aria-label="PipeSage demo home"><span aria-hidden="true">⌁</span> PipeSage</a>
        <span className="badge badge-accent">Interactive demo</span>
        <button className="btn btn-primary" onClick={onStart}>Use your own data <span aria-hidden="true">→</span></button>
      </header>
      <main className="main">
        <section className="demo-hero" aria-labelledby="demo-heading">
          <div>
            <p className="demo-eyebrow">PIPELINE OBSERVABILITY / TAKE A LOOK INSIDE</p>
            <h1 id="demo-heading">From failed run<br />to a clearer <em>next step.</em></h1>
            <p className="demo-intro">Explore how PipeSage surfaces pipeline health, traces failures, and turns run telemetry into actionable incident reports. Start with our example workspace.</p>
            <div className="demo-hero-actions">
              <button className="btn btn-primary" onClick={inspectIncident}>Walk through an incident <span aria-hidden="true">↗</span></button>
              <a className="btn btn-secondary" href="#pipelines">Explore the pipelines</a>
            </div>
            <p className="demo-caption">No account, upload, or Databricks connection needed.</p>
          </div>
          <aside className="demo-path" aria-label="How the project works">
            <p className="demo-eyebrow">THE PATH TO AN ANSWER</p>
            <ol>
              <li><span>01</span><div><strong>Monitor the runs</strong><p>Spot failures and changes in job health.</p></div></li>
              <li><span>02</span><div><strong>Follow the evidence</strong><p>Inspect errors alongside runbook guidance.</p></div></li>
              <li><span>03</span><div><strong>Plan the recovery</strong><p>Review a likely cause and a practical next step.</p></div></li>
            </ol>
          </aside>
        </section>

        <div className="demo-notice"><span className="badge badge-warn">Sample workspace</span><p>Fictional data · October 23–26, 2026. Reports are prewritten examples. Filters and incident exploration work entirely in your browser.</p></div>
        <KpiRow overall={demoOverall} incidents={{ open: 2 }} />
        <div className="demo-section-intro"><h2>Three pipelines. Two signals to investigate.</h2><p>Select a pipeline to filter its runs, then open a failed or timed out run to inspect the example report.</p></div>
        <PipelinesTable jobs={demoJobs} selectedJobId={jobFilter} onSelectJob={id => setJobFilter(current => current === id ? null : id)} />
        <RunsList runs={demoRuns} jobs={demoJobs} statusFilter={statusFilter} onStatusFilter={setStatusFilter} jobFilter={jobFilter} onJobFilter={setJobFilter} selectedRunId={selectedRunId} onSelectRun={setSelectedRunId} />
        {selected?.report && <div ref={reportRef} tabIndex={-1} className="anchor">
          <Card title={`Example incident report · ${selected.run_id}`} id="demo-report" actions={<button className="btn btn-sm btn-ghost" onClick={() => { const id = selectedRunId; setSelectedRunId(null); requestAnimationFrame(() => document.querySelector(`[data-run-id="${id}"]`)?.focus()) }}>Close report</button>}>
            <div className="demo-report-body">
              <span className="badge badge-warn">Illustrative diagnosis · not generated live</span>
              <h3>{selected.job_name}</h3><pre>{selected.report.error}</pre>
              <div className="demo-report-grid"><div><h4>Likely cause</h4><p>{selected.report.cause}</p></div><div><h4>Recommended next step</h4><p>{selected.report.action}</p></div></div>
              <p className="muted">Reference: {selected.report.reference}. This is a fictional reference for the demo.</p>
              <button className="btn btn-secondary" onClick={() => downloadText(`demo-incident-${selected.run_id}.md`, reportText)}>Download example report</button>
            </div>
          </Card>
        </div>}
        <section className="demo-start"><div><p className="demo-eyebrow">YOUR PIPELINES, NEXT</p><h2>Bring your own run telemetry.</h2><p>Open the workspace to upload JSON or use the existing Databricks workflow. Processing your data requires the project’s backend connection.</p></div><button className="btn btn-primary" onClick={onStart}>Use your own data →</button></section>
      </main>
      <footer className="footer"><p>PipeSage · Project demo · All runs and incidents shown here are fictional.</p></footer>
    </div>
  )
}
