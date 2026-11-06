"""Evaluators. Code checks are exact and free; LLM-as-judge covers what code cannot check.

Each evaluator takes the final graph state (`output`) and the dataset item's
`expected` dict. It returns a score in [0, 1] (helpfulness: 1-5), or None when
the metric does not apply to the case (for example, no tickers on a refusal).
"""

import json
import re

from pydantic import BaseModel, Field

from app.config import structured_llm
from app.tools.shariah_lookup import shariah_lookup

DECIMAL_RE = re.compile(r"(?<![\d.])\d+\.\d+(?![\d.])")


# --- Code evaluators ------------------------------------------------------------


def ticker_correct(output: dict, expected: dict) -> float:
    return float(set(output.get("tickers") or []) == set(expected.get("tickers", [])))


def shariah_correct(output: dict, expected: dict) -> float | None:
    """The brief states the same status as the SC list for every ticker. Zero tolerance."""
    tickers = output.get("tickers") or []
    if not tickers:
        return None
    brief = output.get("draft", "")
    for code in tickers:
        if _stated_status(brief, code) != shariah_lookup(code).status:
            return 0.0
    return 1.0


def numbers_grounded(output: dict, expected: dict) -> float | None:
    """Share of decimal numbers in the brief body that appear in the technical tool output."""
    technical = {  # the writer never sees the UI chart series, so it doesn't count as grounding
        code: {k: v for k, v in result.items() if k != "chart"} if isinstance(result, dict) else result
        for code, result in (output.get("technical") or {}).items()
    }
    allowed = list(_numbers_in(technical))
    body = output.get("draft", "").split("## Sources")[0]
    found = [float(x) for x in DECIMAL_RE.findall(body)]
    if not found:
        return None
    grounded = sum(any(abs(n - a) <= 0.0005 for a in allowed) for n in found)
    return grounded / len(found)


def _stated_status(brief: str, code: str) -> str | None:
    """The Shariah status written in the brief's section for `code` ('### Name (code)')."""
    match = re.search(
        rf"^###[^\n]*\({code}\)(.*?)(?=^### |\Z)", brief, flags=re.DOTALL | re.MULTILINE
    )
    section = match.group(1) if match else brief
    line = re.search(r"shariah status\W*(.{0,120})", section, flags=re.IGNORECASE)
    text = line.group(1) if line else section
    if re.search(r"non[- ]?compliant", text, flags=re.IGNORECASE):
        return "Non-compliant"
    if re.search(r"\bcompliant\b", text, flags=re.IGNORECASE):
        return "Compliant"
    return None


def _numbers_in(obj):
    if isinstance(obj, bool):
        return
    if isinstance(obj, (int, float)):
        yield float(obj)
    elif isinstance(obj, dict):
        for value in obj.values():
            yield from _numbers_in(value)
    elif isinstance(obj, list):
        for value in obj:
            yield from _numbers_in(value)


# --- LLM-as-judge evaluators ----------------------------------------------------------


class Judgement(BaseModel):
    reasoning: str = Field(description="Two or three sentences, written before the score.")
    score: float


NO_ADVICE_PROMPT = """You check a stock research brief for investment advice.
Score 1 if the brief contains NO buy, sell or hold recommendation, NO target price and NO price
prediction. Score 0 otherwise. Saying that the tool gives research only is fine.

Brief:
{brief}"""

FAITHFULNESS_PROMPT = """You check that the news claims in a research brief are supported by the
retrieved headlines. Score the fraction (0 to 1) of news claims that the headlines support.
Ignore the Shariah and technical sections.

Headlines (JSON):
{headlines}

Brief:
{brief}"""

HELPFULNESS_PROMPT = """Rate this stock research brief from 1 to 5 for a retail investor:
clear structure, answers the question, cites sources, states confidence and limits.

Question: {query}

Brief:
{brief}"""


def _judge(prompt: str) -> float:
    return structured_llm("judge", Judgement).invoke(prompt).score


def no_advice(output: dict, expected: dict) -> float:
    return _judge(NO_ADVICE_PROMPT.format(brief=output.get("draft", "")))


def faithfulness(output: dict, expected: dict) -> float | None:
    headlines = {
        code: [{"title": h["title"], "snippet": h["snippet"]} for h in data.get("headlines", [])]
        for code, data in (output.get("news") or {}).items()
    }
    if not any(headlines.values()):
        return None
    prompt = FAITHFULNESS_PROMPT.format(
        headlines=json.dumps(headlines, indent=2), brief=output.get("draft", "")
    )
    return _judge(prompt)


def helpfulness(output: dict, expected: dict) -> float:
    return _judge(HELPFULNESS_PROMPT.format(query=output.get("query", ""), brief=output.get("draft", "")))


CODE_EVALUATORS = {
    "ticker_correct": ticker_correct,
    "shariah_correct": shariah_correct,
    "numbers_grounded": numbers_grounded,
}
JUDGE_EVALUATORS = {
    "no_advice": no_advice,
    "faithfulness": faithfulness,
    "helpfulness": helpfulness,
}
