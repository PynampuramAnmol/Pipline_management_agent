from __future__ import annotations

from src.generation.llm_client import PROMPT_BUDGET_CHARS, LLM, LLMError
from src.generation.prompt_builder import build_prompt
from src.generation.response_formatter import FinalResponse, check_answer, render_response
from src.retrieval.run_context import RunContext


def generate_answer(ctx: RunContext, llm: LLM, max_chars: int = PROMPT_BUDGET_CHARS) -> FinalResponse:
    """Facts and evidence are always shown. The model generates a report if facts or evidence are available."""
    rep = ctx.report
    has_facts = bool(ctx.facts)
    has_evidence = any(rep.run_evidence.values()) or bool(rep.related.results)

    # Allow generation if WE HAVE FACTS, even if vector chunks are empty
    if not has_facts and not has_evidence:
        text = render_response(ctx, None, (), None, nothing_to_explain=True)
        return FinalResponse(text, False, None, (), None)

    bundle = build_prompt(ctx, max_chars=max_chars)
    try:
        response = llm.generate(bundle.system, bundle.user)
    except LLMError as exc:
        message = str(exc)
        return FinalResponse(render_response(ctx, None, (), message), False, None, (), message)

    warnings = check_answer(response.text, bundle, ctx, response)
    return FinalResponse(
        text=render_response(ctx, response.text, warnings, None),
        llm_used=True,
        model_text=response.text,
        warnings=warnings,
        llm_error=None,
    )