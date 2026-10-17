"""Retrieval + RAG-category evaluation over data/evaluation_dataset.json.

Run:  python -m src.evaluation.retrieval_metrics --embedder hashing|real [--k 3]

Reports:
  * hit@k and MRR on positive queries (doc-level, expected doc ids)
  * a threshold sweep: for each cutoff T, how many positives are accepted with a RIGHT top-1 doc and how many
    negatives (no relevant doc exists) are wrongly accepted
  * category accuracy per cutoff for retrieval-based classification, against a keyword-rules baseline and
    an always-unclassified baseline (the ablation: does retrieval add anything over simple rules?)
'hashing' is lexical only (offline). 'real' loads the pretrained model (may download on first use).
Small hand-labelled set: a smoke check, not a benchmark. Pick cutoffs from the sweep, then set RAG_* env vars.
"""
from __future__ import annotations

import argparse
import json
import re
from pathlib import Path

from src.ingestion.chunker import chunk_document
from src.ingestion.parser import load_documents
from src.retrieval.chunk_embeddings import embed_chunks
from src.retrieval.embeddings import HashingEmbedder, load_embedder
from src.retrieval.vector_index import VectorIndex

ROOT = Path(__file__).resolve().parents[2]
CUTOFFS = (0.30, 0.40, 0.45, 0.50, 0.55, 0.60, 0.65, 0.70)

# Baseline: plain keyword rules, no retrieval. Deliberately simple.
RULES = (
    ("permissions", r"permission|denied|privilege|not authorized|grant"),
    ("missing_object", r"table_or_view_not_found|table or view|not found|does not exist"),
    ("schema", r"unresolved_column|column|schema mismatch|renamed"),
    ("timeout", r"timeout|timed out|exceeded"),
    ("memory", r"out of memory|oom|heap|executor killed"),
    ("data_quality", r"null|expectation|quality|dropped"),
)


def rules_category(text: str):
    low = text.lower()
    for cat, pat in RULES:
        if re.search(pat, low):
            return cat
    return None


def _ranked_docs(index, qvec, k_chunks=20):
    out, seen = [], set()
    for r in index.search(qvec, top_k=k_chunks):
        if r.chunk.doc_id not in seen:
            seen.add(r.chunk.doc_id)
            out.append((r.chunk.doc_id, r.score))
    return out


def evaluate(embedder, k: int = 3) -> dict:
    docs = load_documents(ROOT / "data" / "diagnostic_documents").docs
    cat_of = {d.doc_id: d.category for d in docs}
    chunks = [c for d in docs for c in chunk_document(d)]
    index = VectorIndex(embedder.dim, embedder.model_name)
    index.add(chunks, embed_chunks(chunks, embedder))
    data = json.loads((ROOT / "data" / "evaluation_dataset.json").read_text())

    pos, hits, rr = [], 0, 0.0
    for item in data["queries"]:
        ranked = _ranked_docs(index, embedder.embed([item["q"]])[0])
        ids = [d for d, _ in ranked]
        first = next((i for i, d in enumerate(ids, 1) if d in item["expected"]), None)
        hits += first is not None and first <= k
        rr += 1.0 / first if first else 0.0
        pos.append({"q": item["q"], "expected": item["expected"], "got": ids[:k], "ranked": ranked,
                    "category": item.get("category"), "rank": first})
    neg = []
    for item in data.get("negatives", []):
        ranked = _ranked_docs(index, embedder.embed([item["q"]])[0])
        neg.append({"q": item["q"], "ranked": ranked, "got": [d for d, _ in ranked[:k]]})

    sweep = []
    for t in CUTOFFS:
        pos_ok = sum(1 for p in pos if p["ranked"] and p["ranked"][0][1] >= t and p["ranked"][0][0] in p["expected"])
        neg_bad = sum(1 for n in neg if n["ranked"] and n["ranked"][0][1] >= t)
        cat_ok = sum(1 for p in pos if p["category"] and p["ranked"] and p["ranked"][0][1] >= t
                     and cat_of.get(p["ranked"][0][0]) == p["category"])
        cat_neg_ok = sum(1 for n in neg if not (n["ranked"] and n["ranked"][0][1] >= t and cat_of.get(n["ranked"][0][0])))
        sweep.append({"cutoff": t, "positives_top1_accepted": pos_ok, "negatives_wrongly_accepted": neg_bad,
                      "category_correct": cat_ok + cat_neg_ok})
    labelled = [p for p in pos if p["category"]]
    total_cat = len(labelled) + len(neg)
    rules_ok = sum(1 for p in labelled if rules_category(p["q"]) == p["category"]) + \
        sum(1 for n in neg if rules_category(n["q"]) is None)
    return {
        "embedder": embedder.model_name, "k": k, "positives": len(pos), "negatives": len(neg),
        "hit_at_k": round(hits / len(pos), 3), "mrr": round(rr / len(pos), 3),
        "sweep": sweep, "category_total": total_cat,
        "rules_baseline_correct": rules_ok, "always_unclassified_correct": len(neg),
        "rows": pos, "neg_rows": neg,
    }


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--embedder", choices=["hashing", "real"], default="hashing")
    ap.add_argument("--k", type=int, default=3)
    a = ap.parse_args()
    emb = HashingEmbedder(dim=4096) if a.embedder == "hashing" else load_embedder()
    o = evaluate(emb, a.k)
    for r in o["rows"]:
        top = f"{r['ranked'][0][0]}@{r['ranked'][0][1]:.3f}" if r["ranked"] else "-"
        print(("HIT  " if r["rank"] and r["rank"] <= o["k"] else "MISS ") + f"rank={r['rank']} top1={top}  {r['q'][:70]}")
    print()
    for n in o["neg_rows"]:
        top = f"{n['ranked'][0][0]}@{n['ranked'][0][1]:.3f}" if n["ranked"] else "-"
        print(f"NEG  top1={top}  {n['q'][:70]}")
    print(f"\n{o['embedder']}  hit@{o['k']}={o['hit_at_k']}  MRR={o['mrr']}  ({o['positives']} positives, {o['negatives']} negatives)\n")
    print("cutoff  positives_top1_accepted  negatives_wrongly_accepted  category_correct/%d" % o["category_total"])
    for s in o["sweep"]:
        print(f"{s['cutoff']:<7} {s['positives_top1_accepted']:>3}/{o['positives']:<22} {s['negatives_wrongly_accepted']:>3}/{o['negatives']:<23} {s['category_correct']:>3}")
    print(f"\nbaselines (category correct out of {o['category_total']}): keyword rules={o['rules_baseline_correct']}, "
          f"always-unclassified={o['always_unclassified_correct']}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
