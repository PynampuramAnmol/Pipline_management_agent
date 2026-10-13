import { useEffect, useMemo, useState } from "react";

const BAD = new Set(["FAILED", "TIMED_OUT", "CANCELLED"]);
const tone = (s) => (BAD.has(s) ? "bad" : s === "SUCCESS" ? "ok" : "neutral");

async function api(path, opts) {
  const res = await fetch(path, opts);
  if (!res.ok) {
    let msg = res.statusText;
    try { msg = (await res.json()).detail || msg; } catch {}
    throw new Error(msg);
  }
  return res.json();
}

function Stat({ label, value, tone }) {
  return (
    <div className={`stat ${tone || ""}`}>
      <div className="stat-value">{value}</div>
      <div className="stat-label">{label}</div>
    </div>
  );
}

function Report({ runId, onClose }) {
  const [rep, setRep] = useState(null);
  const [err, setErr] = useState("");

  useEffect(() => {
    setRep(null); setErr("");
    api(`/api/report/${encodeURIComponent(runId)}`).then(setRep).catch((e) => setErr(e.message));
  }, [runId]);

  function download() {
    const blob = new Blob([rep.markdown], { type: "text/markdown" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `incident-${rep.run.id}.md`;
    a.click();
    URL.revokeObjectURL(a.href);
  }

  return (
    <aside className="panel">
      <div className="panel-head">
        <h2>Incident report</h2>
        <button className="ghost" onClick={onClose} aria-label="Close">✕</button>
      </div>
      {err && <p className="error">{err}</p>}
      {!rep && !err && <p className="muted">Loading…</p>}
      {rep && (
        <>
          <dl>
            <dt>Job</dt><dd>{rep.job.name} <span className="muted">({rep.job.id})</span></dd>
            <dt>Run ID</dt><dd className="mono">{rep.run.id}</dd>
            <dt>Status</dt><dd><span className={`badge ${tone(rep.run.status)}`}>{rep.run.status}</span></dd>
            <dt>Started</dt><dd>{rep.run.started}</dd>
            <dt>Ended</dt><dd>{rep.run.ended}</dd>
            <dt>Duration</dt><dd>{rep.run.duration}</dd>
            {rep.run.queued && (<><dt>Queued</dt><dd>{rep.run.queued}</dd></>)}
            {rep.failed_tasks.length > 0 && (
              <><dt>Failed tasks</dt>
              <dd>{rep.failed_tasks.map((t) => `${t.task}${t.attempts > 1 ? ` (${t.attempts} attempts)` : ""}`).join(", ")}</dd></>
            )}
          </dl>
          <h3>Reason for failure</h3>
          <pre className={rep.reason_recorded ? "reason" : "reason none"}>{rep.reason}</pre>
          <button onClick={download}>Download .md</button>
        </>
      )}
    </aside>
  );
}

export default function App() {
  const [runs, setRuns] = useState([]);
  const [summary, setSummary] = useState(null);
  const [selected, setSelected] = useState(null);
  const [filter, setFilter] = useState("all");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  async function load() {
    try {
      const [r, s] = await Promise.all([api("/api/runs"), api("/api/summary")]);
      setRuns(r.runs); setSummary(s); setErr("");
    } catch (e) { setErr(`Backend unreachable: ${e.message}`); }
  }
  useEffect(() => { load(); }, []);

  async function refresh() {
    setBusy(true);
    try { await api("/api/runs/refresh", { method: "POST" }); await load(); }
    catch (e) { setErr(`Refresh failed: ${e.message}`); }
    finally { setBusy(false); }
  }

  const shown = useMemo(
    () => runs.filter((r) => filter === "all" || (filter === "failed" ? BAD.has(r.status) : r.status === "SUCCESS")),
    [runs, filter]
  );

  return (
    <div className="app">
      <header>
        <div>
          <h1>Pipeline Monitor</h1>
          <p className="muted">Databricks job runs{summary?.source ? ` · source: ${summary.source}` : ""}</p>
        </div>
        <button onClick={refresh} disabled={busy}>{busy ? "Refreshing…" : "Refresh from Databricks"}</button>
      </header>

      {err && <p className="error">{err}</p>}

      {summary && (
        <section className="stats">
          <Stat label="Runs" value={summary.total} />
          <Stat label="Succeeded" value={summary.succeeded} tone="ok" />
          <Stat label="Failed" value={summary.failed} tone="bad" />
        </section>
      )}

      <div className={`layout ${selected ? "with-panel" : ""}`}>
        <section className="card">
          <div className="filters">
            {["all", "failed", "ok"].map((f) => (
              <button key={f} className={filter === f ? "chip active" : "chip"} onClick={() => setFilter(f)}>
                {f === "ok" ? "succeeded" : f}
              </button>
            ))}
          </div>
          <table>
            <thead><tr><th>Job</th><th>Run</th><th>Status</th><th>Started</th><th>Duration</th></tr></thead>
            <tbody>
              {shown.map((r) => (
                <tr key={r.run_id} className={r.run_id === selected ? "sel" : ""}
                    onClick={() => BAD.has(r.status) && setSelected(r.run_id)}
                    style={{ cursor: BAD.has(r.status) ? "pointer" : "default" }}>
                  <td>{r.job_name}</td>
                  <td className="mono">{r.run_id}</td>
                  <td><span className={`badge ${tone(r.status)}`}>{r.status}</span></td>
                  <td>{r.start_time ? new Date(r.start_time).toLocaleString() : "—"}</td>
                  <td>{r.duration_formatted}</td>
                </tr>
              ))}
              {shown.length === 0 && <tr><td colSpan="5" className="muted">No runs.</td></tr>}
            </tbody>
          </table>
          <p className="muted small">Click a failed run to see its incident report.</p>
        </section>
        {selected && <Report runId={selected} onClose={() => setSelected(null)} />}
      </div>
    </div>
  );
}
