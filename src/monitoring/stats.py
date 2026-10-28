"""Dashboard statistics from recorded runs. Pure functions, no I/O."""
from __future__ import annotations

from collections import defaultdict
from typing import Sequence

from src.monitoring.models import ResultState, RunRecord

BAD = {ResultState.FAILED, ResultState.TIMED_OUT, ResultState.CANCELLED}


def _key(r: RunRecord):
    return (r.start_time is None, r.start_time.timestamp() if r.start_time else 0.0, r.run_id)


def _rate(ok: int, finished: int):
    return round(100.0 * ok / finished, 1) if finished else None


def compute_stats(runs: Sequence[RunRecord], recent: int = 10) -> dict:
    """Success rate counts only runs that finished SUCCESS or bad; UNKNOWN/SKIPPED are excluded from the rate."""
    def block(rs: Sequence[RunRecord]) -> dict:
        ok = sum(1 for r in rs if r.result_state is ResultState.SUCCESS)
        bad = sum(1 for r in rs if r.result_state in BAD)
        durs = [r.duration_seconds for r in rs if r.duration_seconds is not None]
        return {
            "runs": len(rs), "succeeded": ok, "failed": bad,
            "other": len(rs) - ok - bad,
            "success_rate": _rate(ok, ok + bad),
            "avg_duration_seconds": round(sum(durs) / len(durs), 1) if durs else None,
            "max_duration_seconds": round(max(durs), 1) if durs else None,
        }

    by_job: dict[str, list[RunRecord]] = defaultdict(list)
    for r in runs:
        by_job[r.job_id].append(r)

    jobs = []
    for jid, rs in by_job.items():
        rs = sorted(rs, key=_key)
        last = rs[-1]
        failures = [r for r in rs if r.result_state in BAD]
        jobs.append({
            "job_id": jid, "job_name": last.job_name or "unnamed", **block(rs),
            "last_run": {"run_id": last.run_id, "status": last.result_state.value,
                         "started": last.start_time.isoformat() if last.start_time else None},
            "last_failure": ({"run_id": failures[-1].run_id,
                              "started": failures[-1].start_time.isoformat() if failures[-1].start_time else None}
                             if failures else None),
            "recent_statuses": [r.result_state.value for r in rs[-recent:]],
        })
    jobs.sort(key=lambda j: (-j["failed"], j["job_name"]))

    daily: dict[str, dict[str, int]] = defaultdict(lambda: {"succeeded": 0, "failed": 0})
    for r in runs:
        if r.start_time is None:
            continue
        day = r.start_time.date().isoformat()
        if r.result_state is ResultState.SUCCESS:
            daily[day]["succeeded"] += 1
        elif r.result_state in BAD:
            daily[day]["failed"] += 1

    states: dict[str, int] = defaultdict(int)
    for r in runs:
        states[r.result_state.value] += 1

    # incidents: a streak of bad runs of one job. Open = the job's latest run is still bad.
    # Recovered = a SUCCESS followed; time to recover = first bad run's start -> that success's start.
    open_jobs, recoveries = [], []
    for jid, rs in by_job.items():
        rs = sorted(rs, key=_key)
        streak_start = None
        for r in rs:
            if r.result_state in BAD:
                if streak_start is None:
                    streak_start = r
            elif r.result_state is ResultState.SUCCESS:
                if streak_start is not None and streak_start.start_time and r.start_time:
                    recoveries.append((r.start_time - streak_start.start_time).total_seconds())
                streak_start = None
        if streak_start is not None:
            open_jobs.append({"job_id": jid, "job_name": rs[-1].job_name or "unnamed",
                              "since": streak_start.start_time.isoformat() if streak_start.start_time else None})
    incidents = {
        "open": len(open_jobs), "open_jobs": open_jobs, "recovered": len(recoveries),
        "avg_recovery_seconds": round(sum(recoveries) / len(recoveries), 1) if recoveries else None,
    }

    return {
        "overall": block(list(runs)),
        "incidents": incidents,
        "by_state": dict(states),
        "jobs": jobs,
        "daily": [{"date": d, **v} for d, v in sorted(daily.items())],
        "note": "Duration includes queue time. Success rate excludes runs that are not SUCCESS or failed/timed out/cancelled.",
    }
