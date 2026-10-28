"""Reference documents for a failed run, found by the custom RAG retriever. No model, no generation.

Matches are similar past text, NOT a diagnosis of this run. Scores are cosine similarity, not probabilities.
"""
from __future__ import annotations

from typing import Optional

from src.reporting.resolutions import PREFIX as RESOLUTION_PREFIX
from src.retrieval.search import RetrievalPipeline


def _item(hit, linked: bool) -> dict:
    c = hit.chunk
    text = " ".join(c.text.split())
    return {
        "doc_id": c.doc_id, "chunk_id": c.chunk_id, "title": c.title or c.doc_id,
        "doc_type": c.doc_type, "source": c.source, "score": round(float(hit.score), 3),
        "linked_to_run": linked, "snippet": text[:300] + ("..." if len(text) > 300 else ""),
    }


def find_references(
    pipeline: RetrievalPipeline,
    run_id: str,
    reason: str,
    top_k: int = 3,
    min_score: Optional[float] = None,
) -> dict:
    """Docs linked to this run id, plus docs similar to the recorded error text."""
    if not reason or not reason.strip():
        return {"status": "no_error_text", "items": [],
                "note": "No error text was recorded, so there is nothing to search with."}
    rep = pipeline.retrieve(f"run {run_id}", top_k=top_k, related_query=reason, min_score=min_score)
    own = RESOLUTION_PREFIX + str(run_id)   # a run's own saved note is not a 'similar past document'
    items, seen = [], set()
    for hits in rep.run_evidence.values():
        for h in hits:
            if h.chunk.chunk_id not in seen and h.chunk.doc_id != own:
                seen.add(h.chunk.chunk_id)
                items.append(_item(h, True))
    for h in rep.related.results:
        if h.chunk.chunk_id not in seen and h.chunk.doc_id != own:
            seen.add(h.chunk.chunk_id)
            items.append(_item(h, False))
    return {
        "status": "ok" if items else "no_match",
        "items": items,
        "note": "Reference only: similar past documents, not the cause of this run. Mock-source documents are samples.",
    }
