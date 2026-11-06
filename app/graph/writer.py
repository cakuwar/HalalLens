"""Writer: joins the agents' results into one cited brief.

The LLM writes the body. The sources list and the disclaimer are appended in
code, so they are always present and always match what the tools returned.
"""

import json

from app.config import get_llm
from app.graph.state import ResearchState
from app.prompts import get_prompt

DISCLAIMER = (
    "*HalalLens provides research only, not financial advice. It does not make buy or sell "
    "recommendations or price predictions. Shariah status is quoted from the Securities "
    "Commission Malaysia list as at the date shown; check the latest list before acting.*"
)


def writer(state: ResearchState) -> dict:
    tickers = state.get("tickers") or []

    # Nothing was researched: explain why (out of scope / ambiguous / not found), no LLM needed.
    if not tickers:
        reason = state.get("scope_error") or "I couldn't work out which stock to research."
        return {"draft": f"{reason}\n\n---\n{DISCLAIMER}"}

    prompt = get_prompt(
        "writer",
        query=state["query"],
        feedback=state.get("feedback") or "none",
        notes=state.get("scope_error") or "none",
        facts=json.dumps(_facts(state), indent=2, default=str),
    )
    response = get_llm("writer").invoke(prompt.text, config=prompt.run_config)
    body = _message_text(response).strip()

    draft = f"{body}\n\n{_sources_section(state)}\n\n---\n{DISCLAIMER}"
    return {"draft": draft}


def _facts(state: ResearchState) -> dict:
    """Everything the writer is allowed to use, per ticker. Headlines are trimmed to save tokens."""
    facts = {}
    for code in state.get("tickers", []):
        news = dict(state.get("news", {}).get(code) or {})
        news["headlines"] = [
            {"n": i, "title": h["title"], "source": h["source"]}
            for i, h in enumerate(news.get("headlines", []), start=1)
        ]
        technical = state.get("technical", {}).get(code)
        if isinstance(technical, dict):
            technical = {k: v for k, v in technical.items() if k != "chart"}  # UI-only series
        facts[code] = {
            "company": state.get("companies", {}).get(code, code),
            "shariah": state.get("shariah", {}).get(code),
            "technical": technical,
            "news": news or None,
        }
    return facts


def _sources_section(state: ResearchState) -> str:
    lines = ["## Sources"]
    for code in state.get("tickers", []):
        name = state.get("companies", {}).get(code, code)
        lines.append(f"\n**{name} ({code})**")
        sh = state.get("shariah", {}).get(code) or {}
        if sh and "error" not in sh:
            lines.append(f"- Shariah status: {sh['source']} (list dated {sh['list_date']})")
        tech = state.get("technical", {}).get(code) or {}
        if tech and "error" not in tech:
            stale = " (cached, may be stale)" if tech.get("stale") else ""
            lines.append(f"- Prices: {tech['source']}, daily data to {tech['as_of']}{stale}")
        for i, h in enumerate((state.get("news", {}).get(code) or {}).get("headlines", []), start=1):
            lines.append(f"- [{i}] [{h['title']}]({h['url']}) ({h['source']})")
    return "\n".join(lines)


def _message_text(message) -> str:
    """Text of an AIMessage. Content can be a list of blocks (e.g. thinking + text)."""
    content = message.content
    if isinstance(content, str):
        return content
    return "".join(
        block.get("text", "") if isinstance(block, dict) else str(block)
        for block in content
        if not isinstance(block, dict) or block.get("type") == "text"
    )
