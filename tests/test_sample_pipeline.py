import pytest
from src.monitoring.sample_pipeline import (
    PRESETS_CATALOG,
    execute_sample_pipeline,
    parse_and_validate_records,
)


def test_parse_and_validate_records_valid():
    sample = [
        {
            "run_id": "r_1",
            "job_id": "j_1",
            "job_name": "test_job",
            "source": "mock",
            "lifecycle_state": "TERMINATED",
            "result_state": "SUCCESS",
            "start_time": "2026-10-01T00:00:00+00:00",
            "end_time": "2026-10-01T00:01:00+00:00",
        }
    ]
    runs, issues, dups = parse_and_validate_records(sample)
    assert len(runs) == 1
    assert len(issues) == 0
    assert dups == 0
    assert runs[0].run_id == "r_1"


def test_parse_and_validate_records_duplicate():
    sample = [
        {"run_id": "r_1", "job_id": "j_1", "source": "mock", "lifecycle_state": "TERMINATED", "result_state": "SUCCESS"},
        {"run_id": "r_1", "job_id": "j_1", "source": "mock", "lifecycle_state": "TERMINATED", "result_state": "SUCCESS"},
    ]
    runs, issues, dups = parse_and_validate_records(sample)
    assert len(runs) == 1
    assert dups == 1


def test_execute_sample_pipeline_presets():
    for pid, preset in PRESETS_CATALOG.items():
        res = execute_sample_pipeline(preset["runs"])
        assert res["status"] in ("success", "warning")
        assert len(res["stages"]) == 5
        assert res["total_duration_ms"] >= 0
        assert res["final_output"] is not None
        assert "scorecard" in res["final_output"]


def test_execute_sample_pipeline_invalid_payload():
    res = execute_sample_pipeline("invalid json string {[[")
    assert res["status"] == "error"
    assert res["stages"][0]["status"] == "error"
    assert res["final_output"] is None
