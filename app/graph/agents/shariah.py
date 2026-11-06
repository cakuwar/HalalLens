"""Shariah agent: looks up each ticker on the official SC Malaysia list.

There is deliberately no LLM here. Compliance is cited from the SC list and is
never judged by a model. That is the project's key design decision, so say so
in the README.
"""

from app.graph.state import ResearchState
from app.tools.shariah_lookup import ShariahListMissing, shariah_lookup


def shariah_agent(state: ResearchState) -> dict:
    results: dict[str, dict] = {}
    for code in state.get("tickers", []):
        try:
            results[code] = shariah_lookup(code).model_dump()
        except ShariahListMissing as exc:
            results[code] = {"error": str(exc)}
    return {"shariah": results}
