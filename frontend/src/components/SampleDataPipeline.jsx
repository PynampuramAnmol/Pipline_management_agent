import { useState, useEffect, useRef } from 'react'
import { StatusBadge, CopyButton } from './common.jsx'
import {
  getSamplePresets,
  processSampleData,
  applySampleData as apiApplySampleData,
  downloadText,
} from '../lib/api.js'
import { formatDuration, formatStatus } from '../lib/format.js'

function StageIcon({ stageId }) {
  if (stageId === 'ingestion_validation') {
    return (
      <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2">
        <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
        <polyline points="14 2 14 8 20 8" />
        <path d="m9 15 2 2 4-4" />
      </svg>
    )
  }
  if (stageId === 'telemetry_aggregation') {
    return (
      <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2">
        <path d="M3 3v18h18" />
        <path d="m19 9-5 5-4-4-3 3" />
      </svg>
    )
  }
  if (stageId === 'error_clustering') {
    return (
      <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2">
        <circle cx="12" cy="12" r="10" />
        <line x1="12" y1="8" x2="12" y2="12" />
        <line x1="12" y1="16" x2="12.01" y2="16" />
      </svg>
    )
  }
  if (stageId === 'rag_diagnostic_matching') {
    return (
      <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2">
        <path d="M12 2a4 4 0 0 1 4 4v1a4 4 0 0 1-8 0V6a4 4 0 0 1 4-4Z" />
        <path d="M6 10v2a6 6 0 0 0 12 0v-2" />
        <line x1="12" y1="18" x2="12" y2="22" />
        <line x1="8" y1="22" x2="16" y2="22" />
      </svg>
    )
  }
  return (
    <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" />
      <polyline points="22 4 12 14.01 9 11.01" />
    </svg>
  )
}

export default function SampleDataPipeline({ onApplied, onClose }) {
  const [presets, setPresets] = useState([])
  const [selectedPresetId, setSelectedPresetId] = useState('baseline')
  const [jsonText, setJsonText] = useState('')
  const [customFile, setCustomFile] = useState(null)
  const [mode, setMode] = useState('preset') // 'preset', 'file', 'paste'

  const [processing, setProcessing] = useState(false)
  const [currentStageIdx, setCurrentStageIdx] = useState(-1)
  const [stageResults, setStageResults] = useState([])
  const [finalOutput, setFinalOutput] = useState(null)
  const [errorMsg, setErrorMsg] = useState(null)
  const [activeLogStageId, setActiveLogStageId] = useState(null)

  const [applying, setApplying] = useState(false)
  const [appliedSuccess, setAppliedSuccess] = useState(false)

  const fileInputRef = useRef(null)

  useEffect(() => {
    let mounted = true
    getSamplePresets()
      .then((data) => {
        if (mounted && Array.isArray(data)) {
          setPresets(data)
        }
      })
      .catch(() => {})
    return () => {
      mounted = false
    }
  }, [])

  function handleFileChange(e) {
    const file = e.target.files?.[0]
    if (!file) return
    setCustomFile(file)
    const reader = new FileReader()
    reader.onload = (evt) => {
      setJsonText(evt.target.result || '')
      setMode('file')
    }
    reader.readAsText(file)
  }

  async function handleRunPipeline() {
    setProcessing(true)
    setErrorMsg(null)
    setStageResults([])
    setFinalOutput(null)
    setAppliedSuccess(false)
    setActiveLogStageId(null)

    let payload = {}
    if (mode === 'preset') {
      payload = { preset_id: selectedPresetId }
    } else {
      if (!jsonText.trim()) {
        setErrorMsg('Please select a preset, upload a JSON file, or paste JSON runs data.')
        setProcessing(false)
        return
      }
      try {
        const parsed = JSON.parse(jsonText)
        payload = { data: parsed }
      } catch (err) {
        setErrorMsg(`Invalid JSON syntax: ${err.message}`)
        setProcessing(false)
        return
      }
    }

    try {
      // Animate stages step-by-step for a realistic processing experience
      for (let i = 0; i < 5; i++) {
        setCurrentStageIdx(i)
        await new Promise((r) => setTimeout(r, 220))
      }

      const res = await processSampleData(payload)
      if (res.status === 'error' && !res.final_output) {
        setStageResults(res.stages || [])
        setErrorMsg('Processing failed during ingestion validation.')
      } else {
        setStageResults(res.stages || [])
        setFinalOutput(res.final_output)
      }
    } catch (err) {
      setErrorMsg(err.message || 'Failed to process sample data.')
    } finally {
      setProcessing(false)
      setCurrentStageIdx(-1)
    }
  }

  async function handleApplyToDashboard() {
    setApplying(true)
    try {
      await apiApplySampleData()
      setAppliedSuccess(true)
      if (onApplied) {
        await onApplied()
      }
    } catch (err) {
      setErrorMsg(`Failed to apply to dashboard: ${err.message}`)
    } finally {
      setApplying(false)
    }
  }

  function handleDownloadReport() {
    if (!finalOutput) return
    const reportStr = JSON.stringify(
      {
        timestamp: new Date().toISOString(),
        scorecard: finalOutput.scorecard,
        summary: finalOutput.executive_summary,
        recommendations: finalOutput.recommendations,
        stages: stageResults,
      },
      null,
      2,
    )
    downloadText('pipeline_sample_processing_report.json', reportStr)
  }

  return (
    <section className="card sample-pipeline-card" aria-labelledby="sample-pipeline-title">
      <div className="card-head sample-pipeline-head">
        <div>
          <div className="sample-pipeline-badge-row">
            <span className="badge badge-accent">
              <span className="pulse-dot" aria-hidden="true" />
              Stage-by-Stage Processing Engine
            </span>
          </div>
          <h2 id="sample-pipeline-title" className="card-title">
            Sample Data Upload & Pipeline Stage Visualizer
          </h2>
          <p className="sample-pipeline-desc">
            Upload custom run telemetry or choose an incident simulation preset to watch each processing stage execute in real-time, inspect audit telemetry, and review synthesized RAG recommendations.
          </p>
        </div>
        {onClose && (
          <button type="button" className="btn btn-sm btn-ghost" onClick={onClose} aria-label="Close sample pipeline">
            ✕ Close
          </button>
        )}
      </div>

      {/* Input Mode Selector & Dataset Configuration */}
      <div className="sample-pipeline-config">
        <div className="sample-mode-tabs" role="tablist">
          <button
            type="button"
            role="tab"
            aria-selected={mode === 'preset'}
            className={`sample-tab-btn ${mode === 'preset' ? 'is-active' : ''}`}
            onClick={() => setMode('preset')}
          >
            1-Click Incident Presets ({presets.length})
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={mode === 'file'}
            className={`sample-tab-btn ${mode === 'file' ? 'is-active' : ''}`}
            onClick={() => setMode('file')}
          >
            Upload JSON File
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={mode === 'paste'}
            className={`sample-tab-btn ${mode === 'paste' ? 'is-active' : ''}`}
            onClick={() => setMode('paste')}
          >
            Paste JSON Payload
          </button>
        </div>

        {/* Preset Cards Selection */}
        {mode === 'preset' && (
          <div className="sample-presets-grid">
            {presets.map((p) => {
              const selected = selectedPresetId === p.id
              return (
                <div
                  key={p.id}
                  className={`preset-card ${selected ? 'is-selected' : ''}`}
                  onClick={() => setSelectedPresetId(p.id)}
                  tabIndex={0}
                  role="button"
                  onKeyDown={(e) => e.key === 'Enter' && setSelectedPresetId(p.id)}
                >
                  <div className="preset-card-top">
                    <span className="preset-card-title">{p.title}</span>
                    <span className="badge badge-neutral">{p.badge}</span>
                  </div>
                  <p className="preset-card-desc">{p.description}</p>
                  <div className="preset-card-meta">
                    <span className="mono">{p.runs_count} runs</span>
                    {selected && <span className="preset-check">✓ Selected</span>}
                  </div>
                </div>
              )
            })}
          </div>
        )}

        {/* File Upload Dropzone */}
        {mode === 'file' && (
          <div
            className="sample-dropzone"
            onClick={() => fileInputRef.current?.click()}
            onDragOver={(e) => e.preventDefault()}
            onDrop={(e) => {
              e.preventDefault()
              const file = e.dataTransfer.files?.[0]
              if (file) {
                setCustomFile(file)
                const reader = new FileReader()
                reader.onload = (evt) => setJsonText(evt.target.result || '')
                reader.readAsText(file)
              }
            }}
          >
            <input
              ref={fileInputRef}
              type="file"
              accept=".json"
              style={{ display: 'none' }}
              onChange={handleFileChange}
            />
            <div className="dropzone-icon">
              <svg viewBox="0 0 24 24" width="32" height="32" fill="none" stroke="currentColor" strokeWidth="1.8">
                <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                <polyline points="17 8 12 3 7 8" />
                <line x1="12" y1="3" x2="12" y2="15" />
              </svg>
            </div>
            <div className="dropzone-text">
              <strong>{customFile ? customFile.name : 'Click to select or drag and drop a JSON runs file'}</strong>
              <p className="muted">
                {customFile
                  ? `${(customFile.size / 1024).toFixed(1)} KB — Click to change file`
                  : 'Accepts exported Databricks run telemetry or mock JSON array'}
              </p>
            </div>
          </div>
        )}

        {/* JSON Editor Paste Area */}
        {mode === 'paste' && (
          <div className="sample-paste-area">
            <textarea
              className="sample-textarea mono"
              rows={6}
              placeholder="Paste JSON array of run records: [ { &quot;run_id&quot;: &quot;r_001&quot;, &quot;job_id&quot;: &quot;j_01&quot;, &quot;result_state&quot;: &quot;SUCCESS&quot; ... } ]"
              value={jsonText}
              onChange={(e) => setJsonText(e.target.value)}
            />
          </div>
        )}

        {/* Action Trigger Button */}
        <div className="sample-action-row">
          <button
            type="button"
            className={`btn btn-primary sample-trigger-btn ${processing ? 'is-busy' : ''}`}
            onClick={handleRunPipeline}
            disabled={processing}
          >
            {processing ? (
              <>
                <span className="spinner" aria-hidden="true" />
                <span>Processing Pipeline Stages…</span>
              </>
            ) : (
              <>
                <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2">
                  <polygon points="5 3 19 12 5 21 5 3" />
                </svg>
                <span>Run Multi-Stage Processing Pipeline</span>
              </>
            )}
          </button>
          {errorMsg && <p className="inline-error">{errorMsg}</p>}
        </div>
      </div>

      {/* Visual Pipeline Stages Stepper */}
      {(processing || stageResults.length > 0) && (
        <div className="pipeline-stepper-container">
          <div className="pipeline-stepper-header">
            <h3 className="pipeline-stepper-title">Pipeline Stage Progression & Health Telemetry</h3>
            {stageResults.length > 0 && (
              <span className="mono muted text-sm">
                Total Execution Time:{' '}
                {stageResults.reduce((acc, s) => acc + (s.duration_ms || 0), 0).toFixed(1)}ms
              </span>
            )}
          </div>

          <div className="pipeline-stages-grid">
            {[
              {
                id: 'ingestion_validation',
                name: '1. Ingestion & Validation',
                desc: 'Schema verification & deduplication',
              },
              {
                id: 'telemetry_aggregation',
                name: '2. Telemetry Aggregation',
                desc: 'KPIs, durations & percentiles',
              },
              {
                id: 'error_clustering',
                name: '3. Error Clustering',
                desc: 'Root cause signature grouping',
              },
              {
                id: 'rag_diagnostic_matching',
                name: '4. Diagnostic RAG Match',
                desc: 'Runbook cross-referencing',
              },
              {
                id: 'synthesis_output',
                name: '5. Final Output & Health',
                desc: 'Synthesis & recommendation report',
              },
            ].map((step, idx) => {
              const result = stageResults.find((s) => s.stage_id === step.id)
              const isCurrent = processing && currentStageIdx === idx
              const isPast = processing && currentStageIdx > idx

              let stageStatus = 'pending'
              if (result) {
                stageStatus = result.status
              } else if (isCurrent) {
                stageStatus = 'processing'
              } else if (isPast) {
                stageStatus = 'success'
              }

              const isLogsOpen = activeLogStageId === step.id

              return (
                <div
                  key={step.id}
                  className={`stage-card stage-status-${stageStatus} ${isLogsOpen ? 'is-logs-expanded' : ''}`}
                >
                  <div className="stage-card-top">
                    <div className="stage-icon-wrap">
                      <StageIcon stageId={step.id} />
                    </div>
                    <span
                      className={`badge badge-${
                        stageStatus === 'success'
                          ? 'ok'
                          : stageStatus === 'warning'
                          ? 'warn'
                          : stageStatus === 'error'
                          ? 'bad'
                          : stageStatus === 'processing'
                          ? 'accent'
                          : 'neutral'
                      }`}
                    >
                      {stageStatus.toUpperCase()}
                    </span>
                  </div>

                  <div className="stage-title-wrap">
                    <span className="stage-name">{step.name}</span>
                    <span className="stage-desc">{step.desc}</span>
                  </div>

                  {result && (
                    <div className="stage-metrics-row">
                      <span className="stage-duration mono">{result.duration_ms}ms</span>
                      {step.id === 'ingestion_validation' && (
                        <span className="stage-metric-pill">
                          {result.metrics.valid_records} valid / {result.metrics.duplicates_dropped} dups
                        </span>
                      )}
                      {step.id === 'telemetry_aggregation' && (
                        <span className="stage-metric-pill">
                          {result.metrics.success_rate}% OK / {result.metrics.total_runs} runs
                        </span>
                      )}
                      {step.id === 'error_clustering' && (
                        <span className="stage-metric-pill">
                          {result.metrics.clusters_count} cluster(s)
                        </span>
                      )}
                      {step.id === 'rag_diagnostic_matching' && (
                        <span className="stage-metric-pill">
                          {result.metrics.matched_runbooks_count} runbook(s)
                        </span>
                      )}
                      {step.id === 'synthesis_output' && (
                        <span className="stage-metric-pill">
                          Score: {result.metrics.health_score}/100
                        </span>
                      )}
                    </div>
                  )}

                  {result?.logs && result.logs.length > 0 && (
                    <button
                      type="button"
                      className="stage-logs-toggle btn btn-sm btn-ghost"
                      onClick={() => setActiveLogStageId(isLogsOpen ? null : step.id)}
                    >
                      {isLogsOpen ? 'Hide Audit Logs ▲' : 'Audit Logs ▼'}
                    </button>
                  )}

                  {isLogsOpen && result?.logs && (
                    <div className="stage-logs-panel mono">
                      {result.logs.map((log, lIdx) => (
                        <div key={lIdx} className="stage-log-line">
                          <span className="log-arrow">›</span> {log}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        </div>
      )}

      {/* Final Output Visualization */}
      {finalOutput && (
        <div className="sample-final-output animate-fade-in">
          <div className="final-output-header">
            <div className="final-scorecard-banner">
              <div className={`health-ring health-ring-${finalOutput.scorecard.health_tone}`}>
                <span className="health-score-val mono">{finalOutput.scorecard.health_score}</span>
                <span className="health-score-label">{finalOutput.scorecard.health_grade}</span>
              </div>
              <div className="health-summary-text">
                <h3 className="final-output-title">Processing & Synthesis Output Complete</h3>
                <p className="final-output-desc">{finalOutput.executive_summary}</p>
              </div>
            </div>
          </div>

          {/* KPI Scorecard Metrics */}
          <div className="final-kpis-grid">
            <div className="kpi-mini-card">
              <span className="kpi-mini-label">Total Runs</span>
              <span className="kpi-mini-val mono">{finalOutput.scorecard.total_runs}</span>
            </div>
            <div className="kpi-mini-card">
              <span className="kpi-mini-label">Success Rate</span>
              <span className="kpi-mini-val mono ok-text">{finalOutput.scorecard.success_rate}%</span>
            </div>
            <div className="kpi-mini-card">
              <span className="kpi-mini-label">Succeeded / Failed</span>
              <span className="kpi-mini-val mono">
                <span className="ok-text">{finalOutput.scorecard.succeeded}</span> /{' '}
                <span className="bad-text">{finalOutput.scorecard.failed}</span>
              </span>
            </div>
            <div className="kpi-mini-card">
              <span className="kpi-mini-label">Avg Runtime</span>
              <span className="kpi-mini-val mono">{finalOutput.scorecard.avg_duration_formatted}</span>
            </div>
            <div className="kpi-mini-card">
              <span className="kpi-mini-label">P95 Runtime</span>
              <span className="kpi-mini-val mono">{finalOutput.scorecard.p95_duration_formatted}</span>
            </div>
            <div className="kpi-mini-card">
              <span className="kpi-mini-label">Unique Jobs</span>
              <span className="kpi-mini-val mono">{finalOutput.scorecard.jobs_count}</span>
            </div>
          </div>

          {/* Diagnostic Cross-Referencing & Recommendations */}
          {finalOutput.recommendations && finalOutput.recommendations.length > 0 && (
            <div className="final-recommendations-section">
              <h4 className="final-section-title">
                <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M12 2v20M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6" />
                </svg>
                RAG Diagnostic Matches & Actionable Recommendations ({finalOutput.recommendations.length})
              </h4>
              <div className="recommendations-list">
                {finalOutput.recommendations.map((rec, rIdx) => (
                  <div key={rIdx} className="recommendation-card">
                    <div className="rec-card-top">
                      <span className="badge badge-bad">{rec.category}</span>
                      <span className="badge badge-accent mono">
                        Confidence: {(rec.confidence_score * 100).toFixed(0)}%
                      </span>
                      <span className="mono muted text-sm">Matched: {rec.matched_document}</span>
                    </div>
                    <div className="rec-error-sig mono">{rec.error_signature}</div>
                    <div className="rec-action-box">
                      <span className="rec-action-label">Recommended Fix:</span>
                      <p className="rec-action-text">{rec.suggested_action}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Processed Runs Telemetry Table Preview */}
          <div className="final-runs-preview-section">
            <h4 className="final-section-title">
              <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2">
                <rect x="3" y="3" width="18" height="18" rx="2" />
                <line x1="3" y1="9" x2="21" y2="9" />
                <line x1="9" y1="21" x2="9" y2="9" />
              </svg>
              Processed Telemetry Runs Preview ({finalOutput.runs.length})
            </h4>
            <div className="runs-preview-table-wrap">
              <table className="runs-preview-table">
                <thead>
                  <tr>
                    <th>Status</th>
                    <th>Run ID</th>
                    <th>Job Name</th>
                    <th>Duration</th>
                    <th>Failure Reason</th>
                  </tr>
                </thead>
                <tbody>
                  {finalOutput.runs.map((r) => (
                    <tr key={r.run_id}>
                      <td>
                        <StatusBadge status={r.status} />
                      </td>
                      <td className="mono">{r.run_id}</td>
                      <td>{r.job_name}</td>
                      <td className="mono">{r.duration_formatted}</td>
                      <td className="error-cell">
                        {r.error_message ? (
                          <span title={r.error_message}>{r.error_message.slice(0, 90)}…</span>
                        ) : (
                          <span className="muted">—</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* Action Staging Controls */}
          <div className="final-actions-bar">
            <button
              type="button"
              className={`btn btn-primary btn-apply-telemetry ${applying ? 'is-busy' : ''}`}
              onClick={handleApplyToDashboard}
              disabled={applying || appliedSuccess}
            >
              {appliedSuccess ? (
                <>✓ Successfully Applied to Live Dashboard!</>
              ) : applying ? (
                <>Applying to Dashboard…</>
              ) : (
                <>
                  <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2">
                    <polyline points="20 6 9 17 4 12" />
                  </svg>
                  <span>Apply This Dataset to Live Dashboard Telemetry</span>
                </>
              )}
            </button>
            <button type="button" className="btn btn-secondary" onClick={handleDownloadReport}>
              Download Processing Report (JSON)
            </button>
            <CopyButton
              text={JSON.stringify(finalOutput.scorecard, null, 2)}
              label="Copy Scorecard"
            />
          </div>
        </div>
      )}
    </section>
  )
}
