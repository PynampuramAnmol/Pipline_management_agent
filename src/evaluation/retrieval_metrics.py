"""Retrieval hit@k over data/evaluation_dataset.json.

Run:  python -m src.evaluation.retrieval_metrics --embedder hashing|real [--k 3]
'hashing' is lexical only (offline). 'real' loads the pretrained model and may download it on first use.
A hit means at least one expected doc_id appears in the top-k chunks. Small hand-labelled set: a smoke check.
"""
from __future__ import annotations

import argparse
import json
from pathlib import Path

from src.ingestion.chunker import chunk_document
from src.ingestion.parser import load_documents
from src.retrieval.chunk_embeddings import embed_chunks
from src.retrieval.embeddings import HashingEmbedder, load_embedder
from src.retrieval.vector_index import VectorIndex

ROOT = Path(__file__).resolve().parents[2]


def evaluate(embedder, k: int = 3) -> dict:
    docs = load_documents(ROOT / "data" / "diagnostic_documents").docs
    chunks = [c for d in docs for c in chunk_document(d)]
    index = VectorIndex(embedder.dim, embedder.model_name)
    index.add(chunks, embed_chunks(chunks, embedder))
    data = json.loads((ROOT / "data" / "evaluation_dataset.json").read_text())
    rows, hits = [], 0
    for item in data["queries"]:
        qv = embedder.embed([item["q"]])[0]
        res = index.search(qv, top_k=k)
        got = []
        for r in res:
            did = r.chunk.doc_id
            if did not in got:
                got.append(did)
        hit = any(e in got for e in item["expected"])
        hits += hit
        rows.append({"q": item["q"], "expected": item["expected"], "got": got, "hit": hit})
    return {"embedder": embedder.model_name, "k": k, "queries": len(rows),
            "hit_at_k": round(hits / len(rows), 3), "rows": rows}


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--embedder", choices=["hashing", "real"], default="hashing")
    ap.add_argument("--k", type=int, default=3)
    a = ap.parse_args()
    emb = HashingEmbedder(dim=4096) if a.embedder == "hashing" else load_embedder()
    out = evaluate(emb, a.k)
    for r in out["rows"]:
        print(("HIT  " if r["hit"] else "MISS ") + r["q"] + "  expected=" + ",".join(r["expected"]) + "  got=" + ",".join(r["got"]))
    print(f"\n{out['embedder']}  hit@{out['k']} = {out['hit_at_k']}  ({out['queries']} queries)")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
