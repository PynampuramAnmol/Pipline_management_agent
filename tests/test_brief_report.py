from src.monitoring.models import RunRecord
from src.reporting.brief_report import build_brief_report


def _run(**kw):
    d = {"run_id": "1", "job_id": "9", "job_name": "J", "result_state": "FAILED",
         "start_time": "2026-01-01T00:00:00+00:00", "end_time": "2026-01-01T00:01:00+00:00",
         "error_message": "boom", "source": "live",
         "tasks": [{"task_key": "t", "result_state": "FAILED", "attempts": 2, "error_message": "boom"},
                   {"task_key": "ok", "result_state": "SUCCESS"}]}
    d.update(kw)
    return RunRecord.from_dict(d)


def test_failed_run_has_reason_and_only_failed_tasks():
    r = build_brief_report(_run())
    assert r.reason == "boom" and r.reason_recorded
    assert [t[0] for t in r.failed_tasks] == ["t"]
    assert "Reason for failure" in r.to_markdown()
    assert r.to_dict()["failed_tasks"][0]["attempts"] == 2


def test_reason_falls_back_to_task_error():
    r = build_brief_report(_run(error_message=None))
    assert r.reason == "boom"


def test_no_error_is_stated_not_invented():
    r = build_brief_report(_run(error_message=None, tasks=[]))
    assert not r.reason_recorded and "No error text" in r.reason
