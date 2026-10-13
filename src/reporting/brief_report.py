"""Minimal incident report: job/run details + failure reason. Deterministic, no model, no retrieval."""
from __future__ import annotations

from dataclasses import dataclass
from typing import Optional

from src.monitoring.formatting import fmt_duration, fmt_time
from src.monitoring.models import ResultState, RunRecord

BAD_STATES = {ResultState.FAILED, ResultState.TIMED_OUT, ResultState.CANCELLED}


@dataclass(frozen=True)
class BriefReport:
    job_id: str
    job_name: str
    run_id: str
    status: str
    source: str
    started: str
    ended: str
    duration: str
    queued: Optional[str]
    failed_tasks: tuple[tuple[str, int, str], ...]  # (task_key, attempts, error)
    reason: str  # verbatim recorded error, or an explicit "none recorded"
    reason_recorded: bool

    def to_dict(self) -> dict:
        return {
            "job": {"id": self.job_id, "name": self.job_name},
            "run": {
                "id": self.run_id, "status": self.status, "source": self.source,
                "started": self.started, "ended": self.ended,
                "duration": self.duration, "queued": self.queued,
            },
            "failed_tasks": [
                {"task": k, "attempts": a, "error": e} for k, a, e in self.failed_tasks
            ],
            "reason": self.reason,
            "reason_recorded": self.reason_recorded,
        }

    def to_markdown(self) -> str:
        out = [
            f"# Incident Report: {self.job_name}",
            "",
            f"- Job: {self.job_name} (ID {self.job_id})",
            f"- Run ID: {self.run_id}",
            f"- Status: {self.status}",
            f"- Started: {self.started}",
            f"- Ended: {self.ended}",
            f"- Duration: {self.duration}",
        ]
        if self.queued:
            out.append(f"- Queued: {self.queued}")
        if self.failed_tasks:
            out.append("- Failed tasks: " + ", ".join(
                f"{k}" + (f" ({a} attempts)" if a > 1 else "") for k, a, _ in self.failed_tasks))
        out += ["", "## Reason for failure", "", self.reason]
        return "\n".join(out) + "\n"


def build_brief_report(run: RunRecord) -> BriefReport:
    failed = tuple(
        (t.task_key, t.attempts, t.error_message or "")
        for t in run.tasks if t.result_state in BAD_STATES
    )
    reason = run.error_message or next((e for _, _, e in failed if e), "")
    return BriefReport(
        job_id=run.job_id,
        job_name=run.job_name or "unnamed",
        run_id=run.run_id,
        status=run.result_state.value,
        source=run.source,
        started=fmt_time(run.start_time),
        ended=fmt_time(run.end_time),
        duration=fmt_duration(run.duration_seconds),
        queued=fmt_duration(run.queue_seconds) if run.queue_seconds else None,
        failed_tasks=failed,
        reason=reason or "No error text was recorded for this run.",
        reason_recorded=bool(reason),
    )
