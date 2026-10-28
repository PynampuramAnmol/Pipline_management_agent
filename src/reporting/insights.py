"""RAG-driven incident insights: failure category, suggested checks, novelty. No model, no generation.

Everything here is read off retrieved documents:
- category: the `category` header of the matched document (linked to this run by metadata, else by similarity)
- checks:   lines QUOTED from matching troubleshooting runbooks, with their doc id
- novelty:  best similarity between the error text and every indexed chunk is low

Thresholds are PROVISIONAL (scores are cosine similarity, not probabilities). Calibrate them with
`python -m src.evaluation.retrieval_metrics --embedder real` and set RAG_* env vars. Matches are reference, not diagnosis.
"""
from __future__ import annotations

import os
from typing import Mapping, Optional, Sequence

import numpy as np

from src.ingestion.parser import Document
from src.reporting.resolutions import PREFIX as RESOLUTION_PREFIX
from src.retrieval.search import RetrievalPipeline


def _env(name: str, default: float) -> float:
    try:
        return float(os.environ.get(name, default))
    except ValueError:
        return default


def thresholds() -> dict:
    return {
        "category_min_score": _env("RAG_CATEGORY_MIN_SCORE", 0.60),
        "checks_min_score": _env("RAG_CHECKS_MIN_SCORE", 0.55),
        "novelty_max_score": _env("RAG_NOVELTY_MAX_SCORE", 0.45),
    }


def _lines(text: str) -> list[str]:
    return [" ".join(x.split()) for x in text.splitlines() if x.strip()]


def build_insights(
    pipeline: RetrievalPipeline,
    docs: Sequence[Document],
    run_id: str,
    reason: str,
    same_error_before: int = 0,
    th: Optional[Mapping[str, float]] = None,
    max_checks: int = 4,
) -> dict:
    t = dict(th or thresholds())
    if not reason or not reason.strip():
        return {"status": "no_error_text", "thresholds": t, "category": None, "checks": [], "novelty": None,
                "note": "No error text was recorded, so nothing was searched."}

    index, embedder = pipeline.index, pipeline.embedder
    qvec = embedder.embed([reason])[0]
    if float(np.linalg.norm(qvec)) == 0.0:
        return {"status": "no_error_text", "thresholds": t, "category": None, "checks": [], "novelty": None,
                "note": "Error text has no searchable content."}

    cat_of = {d.doc_id: d.category for d in docs if d.category}
    own = RESOLUTION_PREFIX + str(run_id)   # this run's own saved note must never count as 'similar'
    ranked = [h for h in index.search(qvec, top_k=11) if h.chunk.doc_id != own][:10]
    best = ranked[0].score if ranked else None

    # category: documents linked to this run by metadata first (a recorded fact), else similarity
    category = None
    for h in index.search(qvec, top_k=3, run_id=run_id):
        if cat_of.get(h.chunk.doc_id):
            category = {"value": cat_of[h.chunk.doc_id], "basis": "linked_document",
                        "doc_id": h.chunk.doc_id, "score": round(h.score, 3)}
            break
    if category is None:
        for h in ranked:
            if h.score < t["category_min_score"]:
                break
            if cat_of.get(h.chunk.doc_id):
                category = {"value": cat_of[h.chunk.doc_id], "basis": "similarity",
                            "doc_id": h.chunk.doc_id, "score": round(h.score, 3)}
                break

    # suggested checks: quoted lines from troubleshooting runbooks. When the category is known, only runbooks of the
    # SAME category are used, so a missing-table error never shows permission advice.
    checks, seen, checks_note = [], set(), None
    want = category["value"] if category else None
    for h in index.search(qvec, top_k=8, doc_type="troubleshooting", min_score=t["checks_min_score"]):
        if want and cat_of.get(h.chunk.doc_id) != want:
            continue
        for ln in _lines(h.chunk.text):
            if ln not in seen and len(checks) < max_checks:
                seen.add(ln)
                checks.append({"text": ln, "doc_id": h.chunk.doc_id, "title": h.chunk.title or h.chunk.doc_id,
                               "source": h.chunk.source, "score": round(h.score, 3)})
    if not checks:
        has_book = want and any(d.doc_type == "troubleshooting" and d.category == want for d in docs)
        if want and has_book:
            checks_note = f"A '{want}' runbook exists but did not match this error closely enough."
        elif want:
            checks_note = f"No runbook on record for category '{want}'. Add one to data/diagnostic_documents/."
        else:
            checks_note = "No runbook matched this error closely enough."

    # novelty: nothing close in the corpus AND the exact error was not seen in earlier runs of this job
    novel = best is not None and best < t["novelty_max_score"] and same_error_before == 0
    novelty = {
        "novel": bool(novel),
        "best_score": round(best, 3) if best is not None else None,
        "note": ("No similar document or earlier run on record." if novel
                 else "Similar documents or earlier runs exist."),
    }
    return {
        "status": "ok", "thresholds": t, "category": category, "checks": checks, "checks_note": checks_note,
        "novelty": novelty,
        "note": "Reference only: read off retrieved documents, not a diagnosis of this run. "
                "Thresholds are provisional. Mock-source documents are samples.",
    }
