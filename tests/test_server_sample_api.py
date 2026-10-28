from fastapi.testclient import TestClient
from server import app

client = TestClient(app)


def test_get_sample_presets():
    res = client.get("/api/sample-data/presets")
    assert res.status_code == 200
    data = res.json()
    assert isinstance(data, list)
    assert len(data) >= 4
    ids = [p["id"] for p in data]
    assert "baseline" in ids
    assert "schema_incident" in ids


def test_get_sample_preset_detail():
    res = client.get("/api/sample-data/preset/baseline")
    assert res.status_code == 200
    preset = res.json()
    assert preset["id"] == "baseline"
    assert len(preset["runs"]) > 0


def test_process_sample_data_preset():
    res = client.post("/api/sample-data/process", json={"preset_id": "schema_incident"})
    assert res.status_code == 200
    out = res.json()
    assert out["status"] in ("success", "warning")
    assert len(out["stages"]) == 5
    assert out["final_output"] is not None
    assert out["final_output"]["scorecard"]["failed"] > 0


def test_apply_sample_data():
    # Process a preset first
    proc_res = client.post("/api/sample-data/process", json={"preset_id": "baseline"})
    assert proc_res.status_code == 200

    # Apply it
    apply_res = client.post("/api/sample-data/apply")
    assert apply_res.status_code == 200
    assert apply_res.json()["status"] == "applied"
    assert apply_res.json()["count"] > 0

    # Verify /api/runs reflects it
    runs_res = client.get("/api/runs")
    assert runs_res.status_code == 200
    assert runs_res.json()["count"] == apply_res.json()["count"]
