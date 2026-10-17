"""Resolution memory: a resolved incident is saved as a document, then retrieved by the custom RAG on similar failures.

A resolution is written by a person (the note) next to the recorded error text. The system never writes the note and
never claims a fix works: it shows "a similar failure was marked resolved by ...", with the original run and score.
Files live in data/resolutions/ (gitignored) and are loaded into the same index as the other documents.
"""
from __future__ import annotations

import os
import re
from datetime import datetime, timezone
from pathlib import Path
from typing import Optional, Sequence

import numpy as np

from src.ingestion.parser import Document
from src.retrieval.search import RetrievalPipeline

SAFE_ID = re.compile(r"^[A-Za-z0-9_.-]{1,64}$")
SAFE_CATEGORY = re.compile(r"^[a-z][a-z0-9_]{1,29}$")
MAX_NOTE = 2000
PREFIX = "RES-"
RUN_MARK = "Resolved run:"
NOTE_MARK = "Resolution note:"


def resolution_min_score() -> float:
    try:
        return float(os.environ.get("RAG_RESOLUTION_MIN_SCORE", 0.60))
    except ValueError:
        return 0.60


def _one_line(text: Optional[str]) -> str:
    return " ".join((text or "").split())


def resolution_doc_id(run_id: str) -> str:
    if not SAFE_ID.match(run_id or ""):
        raise ValueError("run id contains characters that are not allowed")
    return PREFIX + run_id


def save_resolution(
    directory: Path,
    run_id: str,
    job_id: str,
    job_name: str,
    reason: str,
    note: str,
    category: Optional[str] = None,
    now: Optional[datetime] = None,
) -> Path:
    """Write (or overwrite) the resolution document for one run. Returns the file path."""
    note = (note or "").strip()
    if not note:
        raise ValueError("resolution note must not be empty")
    if len(note) > MAX_NOTE:
        raise ValueError(f"resolution note is longer than {MAX_NOTE} characters")
    if not (reason or "").strip():
        raise ValueError("this run has no recorded error text, so there is nothing to remember it by")
    if category and not SAFE_CATEGORY.match(category):
        raise ValueError("category must be lowercase letters, digits and underscores")
    if not SAFE_ID.match(job_id or ""):
        raise ValueError("job id contains characters that are not allowed")
    doc_id = resolution_doc_id(run_id)
    when = now or datetime.now(timezone.utc)
    if when.tzinfo is None:
        raise ValueError("now must be timezone-aware")

    header = [
        f"doc_id: {doc_id}",
        "doc_type: historical_failure",
        "source: live",
        f"title: Resolved: {_one_line(job_name) or 'unnamed'}",
        f"job_id: {job_id}",
        f"timestamp: {when.isoformat()}",
    ]
    if category:
        header.append(f"category: {category}")
    body = f"{reason.strip()}\n{RUN_MARK} {run_id} of job {_one_line(job_name) or 'unnamed'}\n{NOTE_MARK}\n{note}\n"
    directory.mkdir(parents=True, exist_ok=True)
    path = directory / f"{doc_id}.txt"
    tmp = path.with_suffix(".tmp")
    tmp.write_text("\n".join(header) + "\n---\n" + body, encoding="utf-8")
    tmp.replace(path)
    return path


def is_resolution(doc: Document) -> bool:
    return doc.doc_id.startswith(PREFIX)


def parse_resolution(doc: Document) -> dict:
    """Split a resolution document back into (error, resolved run, note)."""
    lines = doc.body.splitlines()
    run_idx = next((i for i, ln in enumerate(lines) if ln.startswith(RUN_MARK)), None)
    note_idx = next((i for i, ln in enumerate(lines) if ln.strip() == NOTE_MARK), None)
    error = "\n".join(lines[:run_idx]).strip() if run_idx is not None else ""
    note = "\n".join(lines[note_idx + 1:]).strip() if note_idx is not None else ""
    run_id = doc.doc_id[len(PREFIX):]
    return {
        "doc_id": doc.doc_id, "run_id": run_id, "job_id": doc.job_id,
        "job_name": (doc.title or "").removeprefix("Resolved: ") or None,
        "error": error, "note": note, "category": doc.category,
        "resolved_at": doc.timestamp.isoformat() if doc.timestamp else None,
    }


def get_resolution(docs: Sequence[Document], run_id: str) -> Optional[dict]:
    want = PREFIX + run_id
    for d in docs:
        if d.doc_id == want:
            return parse_resolution(d)
    return None


def find_similar_resolutions(
    pipeline: RetrievalPipeline,
    docs: Sequence[Document],
    run_id: str,
    reason: str,
    min_score: Optional[float] = None,
    k: int = 3,
) -> list[dict]:
    """Earlier incidents, resolved by a person, whose recorded error is similar to this one. Excludes this run itself."""
    if not (reason or "").strip():
        return []
    threshold = resolution_min_score() if min_score is None else min_score
    res = {d.doc_id: d for d in docs if is_resolution(d)}
    if not res:
        return []
    qvec = pipeline.embedder.embed([reason])[0]
    if float(np.linalg.norm(qvec)) == 0.0:
        return []
    own = PREFIX + run_id
    out, seen = [], set()
    for h in pipeline.index.search(qvec, top_k=40, doc_type="historical_failure"):
        did = h.chunk.doc_id
        if did in seen or did == own or did not in res or h.score < threshold:
            continue
        seen.add(did)
        item = parse_resolution(res[did])
        item["score"] = round(h.score, 3)
        item["error"] = item["error"][:300]
        out.append(item)
        if len(out) >= k:
            break
    return out
