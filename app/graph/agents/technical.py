"""Technical agent: prices come from yfinance and levels are computed in code. The LLM only explains them.

Because the numbers come from tools/indicators.py and not from the model, price
levels cannot be hallucinated. The `numbers_grounded` evaluator checks this.
"""

import json
from typing import Literal

from pydantic import BaseModel, Field

from app.config import structured_llm
from app.graph.state import ResearchState
from app.prompts import get_prompt
from app.tools.indicators import compute_indicators, price_chart
from app.tools.prices import PriceDataError, get_prices


class TechnicalExplanation(BaseModel):
    trend_summary: str = Field(description="1-2 sentences on the trend using MA20/MA50.")
    levels_commentary: str = Field(description="Support and resistance, quoting the given numbers.")
    momentum_commentary: str = Field(description="RSI14 reading and what it usually indicates.")
    candle_commentary: str = Field(description="Recent candlestick patterns, or 'none detected'.")
    confidence: Literal["high", "medium", "low"]
    confidence_note: str = Field(description="One line, e.g. lower if data is stale or short.")


def technical_agent(state: ResearchState) -> dict:
    llm = structured_llm("agent", TechnicalExplanation)
    companies = state.get("companies", {})
    results: dict[str, dict] = {}

    for code in state.get("tickers", []):
        try:
            prices = get_prices(code)
        except PriceDataError as exc:
            results[code] = {"error": str(exc)}
            continue

        facts = compute_indicators(prices.df)
        facts.update(stale=prices.stale, source=prices.source)

        prompt = get_prompt(
            "technical",
            company=companies.get(code, code),
            code=code,
            facts=json.dumps(facts, indent=2),
            feedback=state.get("feedback") or "none",
        )
        explanation: TechnicalExplanation = llm.invoke(prompt.text, config=prompt.run_config)
        # The chart series is for the UI only; it is added after the LLM call so the model never sees it.
        results[code] = {
            **facts,
            "explanation": explanation.model_dump(),
            "chart": price_chart(prices.df),
        }

    return {"technical": results}
