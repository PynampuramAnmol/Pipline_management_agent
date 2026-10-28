from src.monitoring.models import RunRecord
from src.monitoring.stats import compute_stats
from src.reporting.brief_report import build_brief_report, error_type


def _run(rid="1", **kw):
    d = {"run_id": rid, "job_id": "9", "job_name": "J", "result_state": "FAILED",
         "start_time": "2026-01-02T00:00:00+00:00", "end_time": "2026-01-02T00:01:00+00:00",
         "error_message": "AnalysisException: boom", "source": "live",
         "tasks": [{"task_key": "t", "result_state": "FAILED", "attempts": 2, "error_message": "boom"},
                   {"task_key": "ok", "result_state": "SUCCESS"},
                   {"task_key": "down", "result_state": "SKIPPED", "depends_on": ["t"]}]}
    d.update(kw)
    return RunRecord.from_dict(d)


def test_reason_is_verbatim_and_failed_tasks_listed():
    d = build_brief_report(_run()).to_dict()
    assert d["failure"]["reason"] == "AnalysisException: boom" and d["failure"]["reason_recorded"]
    assert d["failure"]["type"] == "AnalysisException"
    assert [t["task"] for t in d["failed_tasks"]] == ["t"] and d["failed_tasks"][0]["attempts"] == 2
    assert d["skipped_tasks"] == ["down"] and len(d["tasks"]) == 3


def test_reason_falls_back_to_task_error():
    d = build_brief_report(_run(error_message=None)).to_dict()
    assert d["failure"]["reason"] == "boom" and d["failure"]["type"] is None


def test_no_error_is_stated_not_invented():
    d = build_brief_report(_run(error_message=None, tasks=[])).to_dict()
    assert not d["failure"]["reason_recorded"] and "No error text" in d["failure"]["reason"]


def test_history_counts_same_error_only_exact_and_earlier():
    ok = _run("0", result_state="SUCCESS", error_message=None, tasks=[],
              start_time="2026-01-01T00:00:00+00:00", end_time="2026-01-01T00:01:00+00:00")
    prev = _run("p", start_time="2026-01-01T12:00:00+00:00", end_time="2026-01-01T12:01:00+00:00")
    other = _run("o", error_message="Different", start_time="2026-01-01T13:00:00+00:00", end_time="2026-01-01T13:01:00+00:00")
    later = _run("l", start_time="2026-01-03T00:00:00+00:00", end_time="2026-01-03T00:01:00+00:00")
    cur = _run("c")
    h = build_brief_report(cur, [ok, prev, other, cur, later]).to_dict()["history"]
    assert h["same_error_run_ids"] == ["p"] and h["same_error_before"] == 1
    assert h["last_success"]["run_id"] == "0" and h["runs"] == 5  # success before this run
    assert {x["run_id"] for x in h["other_failures"]} == {"p", "o", "l"}


def test_markdown_has_sections():
    md = build_brief_report(_run()).to_markdown()
    for s in ("## Pipeline / job", "## Reason for failure", "## Task breakdown", "## Job history"):
        assert s in md


def test_error_type_parsing():
    assert error_type("PERMISSION_DENIED: x") == "PERMISSION_DENIED"
    assert error_type("Run exceeded timeout of 1800 seconds") is None


def test_stats():
    runs = [_run("a", result_state="SUCCESS", error_message=None, tasks=[]), _run("b"),
            _run("c", result_state="UNKNOWN", error_message=None, tasks=[])]
    s = compute_stats(runs)
    assert s["overall"]["runs"] == 3 and s["overall"]["success_rate"] == 50.0
    assert s["jobs"][0]["failed"] == 1 and s["daily"][0]["failed"] == 1


def test_references_linked_and_similar():
    from src.ingestion.chunker import chunk_documents
    from src.ingestion.parser import Document
    from src.reporting.references import find_references
    from src.retrieval.chunk_embeddings import embed_chunks
    from src.retrieval.embeddings import HashingEmbedder
    from src.retrieval.search import RetrievalPipeline
    from src.retrieval.vector_index import VectorIndex

    docs = [
        Document(doc_id="A", doc_type="error_log", source="mock", origin="a", title="Perm", run_id="r1",
                 body="PERMISSION_DENIED principal lacks SELECT privilege on customers"),
        Document(doc_id="B", doc_type="troubleshooting", source="mock", origin="b", title="Other",
                 body="permission denied select privilege customers grant access to the principal"),
        Document(doc_id="C", doc_type="error_log", source="mock", origin="c", title="Unrelated",
                 body="out of memory during shuffle join executor killed"),
    ]
    e = HashingEmbedder(dim=2048)
    chunks = chunk_documents(docs)
    idx = VectorIndex(e.dim, e.model_name)
    idx.add(chunks, embed_chunks(chunks, e))
    p = RetrievalPipeline(idx, e, known_run_ids=["r1"], min_score=0.15)
    out = find_references(p, "r1", "PERMISSION_DENIED: principal lacks SELECT privilege on customers")
    assert out["status"] == "ok"
    ids = [i["doc_id"] for i in out["items"]]
    assert ids[0] == "A" and out["items"][0]["linked_to_run"] is True
    assert "B" in ids and "C" not in ids
    assert find_references(p, "r1", "")["status"] == "no_error_text"


def _insight_pipeline():
    from src.ingestion.chunker import chunk_documents
    from src.ingestion.parser import Document
    from src.retrieval.chunk_embeddings import embed_chunks
    from src.retrieval.embeddings import HashingEmbedder
    from src.retrieval.search import RetrievalPipeline
    from src.retrieval.vector_index import VectorIndex

    docs = [
        Document(doc_id="E1", doc_type="error_log", source="mock", origin="a", title="Perm", run_id="r1",
                 category="permissions", body="PERMISSION_DENIED principal lacks SELECT privilege on customers"),
        Document(doc_id="T1", doc_type="troubleshooting", source="mock", origin="b", title="Perm runbook",
                 category="permissions",
                 body="Run SHOW GRANTS on the table to see privileges for the principal\nAsk the table owner to grant SELECT access"),
        Document(doc_id="E2", doc_type="error_log", source="mock", origin="c", title="OOM", category="memory",
                 body="out of memory during shuffle join executor killed"),
    ]
    e = HashingEmbedder(dim=2048)
    chunks = chunk_documents(docs)
    idx = VectorIndex(e.dim, e.model_name)
    idx.add(chunks, embed_chunks(chunks, e))
    return RetrievalPipeline(idx, e, known_run_ids=["r1"], min_score=0.15), docs


TH = {"category_min_score": 0.3, "checks_min_score": 0.15, "novelty_max_score": 0.2}


def test_insights_category_linked_and_checks_quoted():
    from src.reporting.insights import build_insights
    p, docs = _insight_pipeline()
    out = build_insights(p, docs, "r1", "PERMISSION_DENIED: principal lacks SELECT privilege on customers", th=TH)
    assert out["category"]["value"] == "permissions" and out["category"]["basis"] == "linked_document"
    texts = [c["text"] for c in out["checks"]]
    assert "Run SHOW GRANTS on the table to see privileges for the principal" in texts
    assert all(c["doc_id"] == "T1" for c in out["checks"])
    assert out["novelty"]["novel"] is False


def test_insights_category_by_similarity_when_not_linked():
    from src.reporting.insights import build_insights
    p, docs = _insight_pipeline()
    out = build_insights(p, docs, "other", "out of memory during shuffle join", th=TH)
    assert out["category"]["value"] == "memory" and out["category"]["basis"] == "similarity"


def test_insights_unclassified_and_novel_when_nothing_matches():
    from src.reporting.insights import build_insights
    p, docs = _insight_pipeline()
    out = build_insights(p, docs, "other", "zzqx wibble frobnicate quux", th={**TH, "novelty_max_score": 0.9})
    assert out["category"] is None and out["checks"] == []
    assert out["novelty"]["novel"] is True


def test_insights_not_novel_if_same_error_seen_before_and_empty_reason():
    from src.reporting.insights import build_insights
    p, docs = _insight_pipeline()
    out = build_insights(p, docs, "other", "zzqx wibble frobnicate quux",
                         same_error_before=1, th={**TH, "novelty_max_score": 0.9})
    assert out["novelty"]["novel"] is False
    assert build_insights(p, docs, "r1", "")["status"] == "no_error_text"


def test_document_category_header_parses():
    from src.ingestion.parser import parse_document
    d = parse_document("doc_id: X\ndoc_type: error_log\nsource: mock\ncategory: Schema\n---\nbody here", "x.txt")
    assert d.category == "schema"


# ---- recovery, timeline, incidents, self-match, category-filtered checks (added with the dashboard update)
def _mk(rid, state, start, job="J1"):
    from datetime import datetime, timedelta, timezone
    from src.monitoring.models import ResultState, RunRecord
    t0 = datetime(2026, 10, 28, 11, 0, tzinfo=timezone.utc) + timedelta(minutes=start)
    return RunRecord(run_id=rid, job_id=job, job_name=job, result_state=state, lifecycle_state="TERMINATED",
                     start_time=t0, end_time=t0 + timedelta(seconds=30), error_message="boom" if state is not ResultState.SUCCESS else None,
                     tasks=[], source="live")


def test_recovered_by_and_timeline():
    from src.monitoring.models import ResultState as S
    a, b, c = _mk("1", S.FAILED, 0), _mk("2", S.FAILED, 1), _mk("3", S.SUCCESS, 45)
    h = build_brief_report(b, [a, b, c]).to_dict()["history"]
    assert h["recovered_by"]["run_id"] == "3" and h["recovered_by"]["after_seconds"] == 44 * 60
    assert [x["run_id"] for x in h["timeline"]] == ["1", "2", "3"]
    assert [x["current"] for x in h["timeline"]] == [False, True, False]
    assert build_brief_report(c, [a, b, c]).to_dict()["history"]["recovered_by"] is None


def test_incident_stats_open_and_recovered():
    from src.monitoring.models import ResultState as S
    from src.monitoring.stats import compute_stats
    runs = [_mk("1", S.FAILED, 0), _mk("2", S.FAILED, 1), _mk("3", S.SUCCESS, 45),
            _mk("4", S.SUCCESS, 0, job="J2"), _mk("5", S.FAILED, 10, job="J2")]
    inc = compute_stats(runs)["incidents"]
    assert inc["open"] == 1 and inc["open_jobs"][0]["job_id"] == "J2"
    assert inc["recovered"] == 1 and inc["avg_recovery_seconds"] == 45 * 60


def test_own_resolution_is_not_a_similar_document_or_novelty_score():
    from src.ingestion.parser import parse_document
    from src.reporting.insights import build_insights
    from src.reporting.references import find_references
    from src.retrieval.chunk_embeddings import embed_chunks
    from src.retrieval.embeddings import HashingEmbedder
    from src.retrieval.search import RetrievalPipeline
    from src.retrieval.vector_index import VectorIndex
    from src.ingestion.chunker import chunk_documents
    err = "table orders_clean not found in schema sales"
    docs = [parse_document("doc_id: RES-77\ndoc_type: historical_failure\nsource: live\ncategory: missing_object\n---\n" + err + "\nResolution note:\nfixed"),
            parse_document("doc_id: TS-9\ndoc_type: troubleshooting\ncategory: permissions\nsource: mock\n---\ngrant select on table")]
    e = HashingEmbedder(dim=2048); ch = chunk_documents(docs)
    idx = VectorIndex(e.dim, e.model_name); idx.add(ch, embed_chunks(ch, e))
    pl = RetrievalPipeline(idx, e, known_run_ids=["77"], min_score=0.1)
    ins = build_insights(pl, docs, "77", err, th={"category_min_score": 0.3, "checks_min_score": 0.0, "novelty_max_score": 0.45})
    assert ins["category"] is None or ins["category"]["doc_id"] != "RES-77"
    assert all(i["doc_id"] != "RES-77" for i in find_references(pl, "77", err)["items"])
    # category known elsewhere -> checks from a different category are not shown
    ins2 = build_insights(pl, docs, "78", err, th={"category_min_score": 0.3, "checks_min_score": 0.0, "novelty_max_score": 0.45})
    assert ins2["category"]["value"] == "missing_object" and ins2["checks"] == [] and ins2["checks_note"]
