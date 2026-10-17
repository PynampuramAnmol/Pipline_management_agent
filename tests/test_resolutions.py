from datetime import datetime, timezone

import pytest

from src.ingestion.chunker import chunk_documents
from src.ingestion.parser import load_documents
from src.reporting.resolutions import (
    find_similar_resolutions, get_resolution, save_resolution,
)
from src.retrieval.chunk_embeddings import embed_chunks
from src.retrieval.embeddings import HashingEmbedder
from src.retrieval.search import RetrievalPipeline
from src.retrieval.vector_index import VectorIndex

NOW = datetime(2026, 10, 17, 12, 0, tzinfo=timezone.utc)
ERR = "AnalysisException: [TABLE_OR_VIEW_NOT_FOUND] The table or view `bronze`.`raw_customers` cannot be found."


def _save(tmp_path, run_id="111", note="Created the missing bronze.raw_customers table.", reason=ERR, **kw):
    return save_resolution(tmp_path, run_id, "9", "job_fail_2", reason, note, now=NOW, **kw)


def _pipeline(docs):
    e = HashingEmbedder(dim=4096)
    chunks = chunk_documents(docs)
    idx = VectorIndex(e.dim, e.model_name)
    idx.add(chunks, embed_chunks(chunks, e))
    return RetrievalPipeline(idx, e, known_run_ids=["111", "222"], min_score=0.15)


def test_saved_resolution_loads_clean_and_round_trips(tmp_path):
    _save(tmp_path, category="missing_object")
    res = load_documents(tmp_path)
    assert res.issues == [] and len(res.docs) == 1
    d = res.docs[0]
    assert d.doc_id == "RES-111" and d.doc_type == "historical_failure" and d.category == "missing_object"
    got = get_resolution(res.docs, "111")
    assert got["note"] == "Created the missing bronze.raw_customers table." and got["error"] == ERR
    assert got["job_name"] == "job_fail_2" and got["resolved_at"].startswith("2026-10-17")


def test_multiline_note_and_overwrite(tmp_path):
    _save(tmp_path, note="Step one.\nStep two.")
    _save(tmp_path, note="Replaced note.")
    docs = load_documents(tmp_path).docs
    assert len(docs) == 1 and get_resolution(docs, "111")["note"] == "Replaced note."
    _save(tmp_path, run_id="112", note="Line A\nLine B")
    assert get_resolution(load_documents(tmp_path).docs, "112")["note"] == "Line A\nLine B"


@pytest.mark.parametrize("kw", [
    {"run_id": "../evil"}, {"run_id": "a/b"}, {"note": "   "}, {"reason": ""},
    {"category": "Bad Cat"}, {"note": "x" * 2001},
])
def test_bad_input_is_rejected_and_writes_nothing(tmp_path, kw):
    with pytest.raises(ValueError):
        _save(tmp_path, **kw)
    assert list(tmp_path.glob("*")) == []


def test_similar_failure_finds_earlier_resolution_and_excludes_itself(tmp_path):
    _save(tmp_path, run_id="111")
    docs = load_documents(tmp_path).docs
    p = _pipeline(docs)
    hits = find_similar_resolutions(p, docs, "222", ERR + " again", min_score=0.3)
    assert [h["run_id"] for h in hits] == ["111"]
    assert hits[0]["note"].startswith("Created the missing") and hits[0]["score"] >= 0.3
    assert find_similar_resolutions(p, docs, "111", ERR, min_score=0.3) == []   # never matches itself


def test_unrelated_error_gets_no_resolution_and_empty_cases(tmp_path):
    _save(tmp_path, run_id="111")
    docs = load_documents(tmp_path).docs
    p = _pipeline(docs)
    assert find_similar_resolutions(p, docs, "222", "zzqx wibble frobnicate quux", min_score=0.3) == []
    assert find_similar_resolutions(p, docs, "222", "", min_score=0.3) == []
    assert find_similar_resolutions(p, [], "222", ERR, min_score=0.3) == []
