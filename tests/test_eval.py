from src.evaluation.retrieval_metrics import CUTOFFS, evaluate, rules_category
from src.retrieval.embeddings import HashingEmbedder


def test_eval_runs_offline_and_is_well_formed():
    o = evaluate(HashingEmbedder(dim=2048), k=3)
    assert o["positives"] >= 10 and o["negatives"] >= 5
    assert 0.0 <= o["hit_at_k"] <= 1.0 and 0.0 <= o["mrr"] <= 1.0
    assert len(o["sweep"]) == len(CUTOFFS)
    for s in o["sweep"]:
        assert 0 <= s["positives_top1_accepted"] <= o["positives"]
        assert 0 <= s["negatives_wrongly_accepted"] <= o["negatives"]
        assert 0 <= s["category_correct"] <= o["category_total"]


def test_every_labelled_category_exists_on_some_document():
    import json
    from pathlib import Path
    from src.ingestion.parser import load_documents
    root = Path(__file__).resolve().parents[1]
    cats = {d.category for d in load_documents(root / "data" / "diagnostic_documents").docs if d.category}
    data = json.loads((root / "data" / "evaluation_dataset.json").read_text())
    assert {q["category"] for q in data["queries"]} <= cats


def test_rules_baseline():
    assert rules_category("PERMISSION_DENIED: x") == "permissions"
    assert rules_category("something unrelated") is None
