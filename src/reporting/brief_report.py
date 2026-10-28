"""Detailed incident report from recorded data only. Deterministic: no model, no retrieval, no guessing."""
from __future__ import annotations

import re
from dataclasses import dataclass
from typing import Optional, Sequence

from src.monitoring.formatting import fmt_duration, fmt_time
from src.monitoring.models import ResultState, RunRecord, TaskRecord

BAD_STATES = {ResultState.FAILED, ResultState.TIMED_OUT, ResultState.CANCELLED}
_TYPE_RE = re.compile(r"^\s*([A-Za-z_][\w.]*(?:Exception|Error|Denied|DENIED|Timeout)?[\w.]*)\s*[:\[]")


def _norm(text: Optional[str]) -> str:
    return " ".join((text or "").lower().split())


def error_type(message: str) -> Optional[str]:
    """Leading exception/class token ("AnalysisException", "PERMISSION_DENIED") or None. Never guessed."""
    m = _TYPE_RE.match(message or "")
    return m.group(1) if m else None


def _start_key(r: RunRecord):
    return (r.start_time is None, r.start_time.timestamp() if r.start_time else 0.0, r.run_id)


def _task(t: TaskRecord) -> dict:
    return {
        "task": t.task_key, "state": t.result_state.value, "attempts": t.attempts,
        "started": fmt_time(t.start_time), "ended": fmt_time(t.end_time),
        "duration": fmt_duration(t.duration_seconds),
        "depends_on": list(t.depends_on), "error": t.error_message or "",
    }


@dataclass(frozen=True)
class BriefReport:
    data: dict

    def to_dict(self) -> dict:
        return self.data

    def to_markdown(self) -> str:
        d = self.data
        j, r, f, h = d["job"], d["run"], d["failure"], d["history"]
        o = [
            f"# Incident Report: {j['name']}", "",
            "## Pipeline / job",
            f"- Job: {j['name']} (ID {j['id']})",
            f"- Run ID: {r['id']}",
            f"- Status: {r['status']}" + (f" (lifecycle: {r['lifecycle']})" if r["lifecycle"] else ""),
            f"- Started: {r['started']}",
            f"- Ended: {r['ended']}",
            f"- Duration: {r['duration']}" + (f" (includes {r['queued']} queued)" if r["queued"] else ""),
            f"- Data source: {r['source']}", "",
            "## Reason for failure",
        ]
        if f["type"]:
            o.append(f"- Error type: {f['type']}")
        if d["failed_tasks"]:
            o.append("- Failed tasks: " + ", ".join(
                t["task"] + (f" ({t['attempts']} attempts)" if t["attempts"] > 1 else "") for t in d["failed_tasks"]))
        o += ["", "```", f["reason"], "```", ""]
        if d["tasks"]:
            o += ["## Task breakdown", "", "| Task | State | Attempts | Duration | Depends on |", "|---|---|---|---|---|"]
            for t in d["tasks"]:
                o.append(f"| {t['task']} | {t['state']} | {t['attempts']} | {t['duration']} | {', '.join(t['depends_on']) or '-'} |")
            o.append("")
        if d["skipped_tasks"]:
            o += ["## Impact", "- Not run because of the failure: " + ", ".join(d["skipped_tasks"]), ""]
        o += ["## Job history", f"- Runs of this job on record: {h['runs']} ({h['succeeded']} succeeded, {h['failed']} failed/timed out/cancelled)"]
        if h["last_success"]:
            o.append(f"- Last success before this run: run {h['last_success']['run_id']} at {h['last_success']['started']}")
        else:
            o.append("- Last success before this run: none on record")
        o.append(f"- Same error seen before in this job: {h['same_error_before']} earlier run(s)"
                 + (": " + ", ".join(h["same_error_run_ids"]) if h["same_error_run_ids"] else ""))
        if h["other_failures"]:
            o.append("- Other failures in this job: " + ", ".join(
                f"{x['run_id']} ({x['started']})" for x in h["other_failures"]))
        o.append("")
        o.append("_Generated only from recorded run data. No cause is inferred beyond the recorded error text._")
        return "\n".join(o) + "\n"


def build_brief_report(run: RunRecord, all_runs: Sequence[RunRecord] = ()) -> BriefReport:
    failed = [t for t in run.tasks if t.result_state in BAD_STATES]
    reason = run.error_message or next((t.error_message for t in failed if t.error_message), "") or ""

    same_job = sorted((r for r in all_runs if r.job_id == run.job_id), key=_start_key)
    if run not in same_job and all_runs:
        same_job = sorted(same_job + [run], key=_start_key)
    before = [r for r in same_job if r is not run and r.run_id != run.run_id
              and (r.start_time is None or run.start_time is None or r.start_time <= run.start_time)]
    key = _norm(reason)
    same_err = [r for r in before if key and _norm(r.error_message) == key]
    succ = [r for r in same_job if r.result_state is ResultState.SUCCESS]
    prior_ok = [r for r in succ if r.start_time is not None and run.start_time is not None
                and r.start_time < run.start_time]
    last_ok = prior_ok[-1] if prior_ok else None  # last success BEFORE this run
    later_ok = [r for r in succ if r.start_time is not None and run.start_time is not None
                and r.start_time > run.start_time]
    first_later = later_ok[0] if later_ok else None  # first success AFTER this run: the job recovered
    history = {
        "runs": len(same_job),
        "succeeded": len(succ),
        "failed": sum(1 for r in same_job if r.result_state in BAD_STATES),
        "last_success": {"run_id": last_ok.run_id, "started": fmt_time(last_ok.start_time)} if last_ok else None,
        "recovered_by": ({"run_id": first_later.run_id, "started": fmt_time(first_later.start_time),
                          "after_seconds": round((first_later.start_time - run.start_time).total_seconds())}
                         if first_later and run.result_state in BAD_STATES else None),
        "timeline": [
            {"run_id": r.run_id, "status": r.result_state.value,
             "started": r.start_time.isoformat() if r.start_time else None,
             "duration_seconds": r.duration_seconds, "current": r.run_id == run.run_id}
            for r in same_job
        ],
        "same_error_before": len(same_err),
        "same_error_run_ids": [r.run_id for r in same_err],
        "other_failures": [
            {"run_id": r.run_id, "started": fmt_time(r.start_time)}
            for r in same_job if r.result_state in BAD_STATES and r.run_id != run.run_id
        ],
    }
    return BriefReport({
        "job": {"id": run.job_id, "name": run.job_name or "unnamed"},
        "run": {
            "id": run.run_id, "status": run.result_state.value, "lifecycle": run.lifecycle_state,
            "source": run.source, "started": fmt_time(run.start_time), "ended": fmt_time(run.end_time),
            "duration": fmt_duration(run.duration_seconds),
            "queued": fmt_duration(run.queue_seconds) if run.queue_seconds else None,
        },
        "failure": {"reason": reason or "No error text was recorded for this run.",
                    "reason_recorded": bool(reason), "type": error_type(reason)},
        "failed_tasks": [_task(t) for t in failed],
        "skipped_tasks": [t.task_key for t in run.tasks if t.result_state is ResultState.SKIPPED],
        "tasks": [_task(t) for t in run.tasks],
        "history": history,
    })
