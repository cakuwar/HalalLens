"""Shared graph state.

Each parallel agent writes to its own key (shariah / technical / news), so the
branches never overwrite each other. Results are keyed by Bursa code, so one
run can cover several stocks ("Compare TENAGA and YTLPOWR").
"""

from typing import Annotated, Literal, TypedDict

from langgraph.graph.message import add_messages

AgentName = Literal["shariah", "technical", "news"]
ALL_AGENTS: tuple[AgentName, ...] = ("shariah", "technical", "news")


class ResearchState(TypedDict, total=False):
    messages: Annotated[list, add_messages]  # chat history, used for follow-ups
    query: str
    tickers: list[str]  # resolved Bursa codes, e.g. ["5347", "6742"]
    companies: dict[str, str]  # code -> company name
    scope_error: str | None  # out of scope / ambiguous / not found: the writer explains it
    agents_to_run: list[AgentName]

    # One key per specialist; each maps code -> result dict
    shariah: dict  # {code: {status, list_date, sector, source, note}}
    technical: dict  # {code: {price, supports, resistances, rsi14, ma20, ma50, trend, patterns, explanation}}
    news: dict  # {code: {headlines, summary, sentiment, key_points}}

    draft: str
    feedback: str | None  # reviewer's "dig deeper" request
    revision: int  # number of revise loops so far (capped by settings.max_revisions)
    final_brief: str
    saved_id: str | None  # file stem of the saved brief in data/briefs/ (.md + .json)
