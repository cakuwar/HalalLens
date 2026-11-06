"""News agent: Tavily search on Malaysian business sites, then an LLM summary and sentiment tag.

Every key point cites the numbered headlines it came from, so the reader (and the
`faithfulness` judge) can check each claim against its source.
"""

from typing import Literal

from pydantic import BaseModel, Field

from app.config import structured_llm
from app.graph.state import ResearchState
from app.prompts import get_prompt
from app.tools.news_search import NewsSearchError, search_news


class KeyPoint(BaseModel):
    claim: str
    sources: list[int] = Field(description="1-based numbers of the headlines that support it.")


class NewsAnalysis(BaseModel):
    summary: str = Field(description="2-3 sentences on what the recent news says.")
    sentiment: Literal["positive", "neutral", "negative", "mixed"]
    key_points: list[KeyPoint]
    confidence: Literal["high", "medium", "low"]
    confidence_note: str


def news_agent(state: ResearchState) -> dict:
    llm = structured_llm("agent", NewsAnalysis)
    companies = state.get("companies", {})
    results: dict[str, dict] = {}

    for code in state.get("tickers", []):
        company = companies.get(code, code)
        try:
            headlines = search_news(company, code, extra=state.get("feedback"))
        except NewsSearchError as exc:
            results[code] = {"error": str(exc), "headlines": []}
            continue

        if not headlines:
            results[code] = {
                "headlines": [],
                "summary": "No recent news found on the Malaysian business sites searched.",
                "sentiment": "neutral",
                "key_points": [],
                "confidence": "low",
                "confidence_note": "No headlines retrieved.",
            }
            continue

        numbered = "\n".join(
            f"[{i}] {h['title']} ({h['source']}, {h.get('published_date') or 'date n/a'})\n    {h['snippet']}"
            for i, h in enumerate(headlines, start=1)
        )
        prompt = get_prompt(
            "news",
            company=company,
            code=code,
            headlines=numbered,
            feedback=state.get("feedback") or "none",
        )
        analysis: NewsAnalysis = llm.invoke(prompt.text, config=prompt.run_config)
        results[code] = {"headlines": headlines, **analysis.model_dump()}

    return {"news": results}
