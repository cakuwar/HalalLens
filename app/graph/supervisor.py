"""Supervisor: understand the request, resolve tickers, choose which agents run.

The LLM only extracts company mentions and picks agents. Mapping a mention to a
Bursa code is done by `resolve_ticker` (fuzzy match in code), so a wrong ticker
can be traced to the resolver, not to the model.
"""

from typing import Literal

from langchain_core.messages import HumanMessage
from pydantic import BaseModel, Field

from app.config import structured_llm
from app.graph.state import ALL_AGENTS, ResearchState
from app.prompts import get_prompt
from app.tools.shariah_lookup import TickerMatch, is_ambiguous, resolve_ticker


class RequestPlan(BaseModel):
    in_scope: bool = Field(
        description="False if the request is not research on a Bursa Malaysia stock, e.g. a US stock."
    )
    company_mentions: list[str] = Field(
        default_factory=list,
        description="Each company or stock code the user refers to, copied as written (keep typos).",
    )
    agents: list[Literal["shariah", "technical", "news"]] = Field(
        default_factory=list, description="Specialists to run. All three for a general analysis."
    )
    reason: str = Field(description="One sentence explaining the plan.")


def supervisor(state: ResearchState) -> dict:
    feedback = state.get("feedback")
    prev_tickers = state.get("tickers") or []
    prev_companies = state.get("companies") or {}
    is_revision = bool(feedback) and bool(prev_tickers)

    prompt = get_prompt(
        "supervisor",
        query=state["query"],
        feedback=feedback or "none",
        previous_companies=", ".join(f"{n} ({c})" for c, n in prev_companies.items()) or "none",
    )
    plan: RequestPlan = structured_llm("agent", RequestPlan).invoke(
        prompt.text, config=prompt.run_config
    )
    agents = plan.agents or list(ALL_AGENTS)

    # Revise loop: same tickers, re-run only the agents the feedback needs.
    if is_revision:
        return {"agents_to_run": agents, "scope_error": None}

    # New request: reset the per-agent results so stale data from an earlier
    # question on this thread never reaches the writer.
    fresh: dict = {
        "messages": [HumanMessage(content=state["query"])],
        "shariah": {},
        "technical": {},
        "news": {},
    }

    if not plan.in_scope:
        return {
            **fresh,
            "tickers": [],
            "agents_to_run": [],
            "scope_error": "HalalLens only covers stocks listed on Bursa Malaysia. " + plan.reason,
        }

    tickers: list[str] = []
    companies: dict[str, str] = {}
    problems: list[str] = []
    for mention in plan.company_mentions:
        matches = resolve_ticker(mention)
        if not matches:
            problems.append(f"I couldn't find '{mention}' on Bursa Malaysia.")
        elif is_ambiguous(matches):
            problems.append(f"'{mention}' could mean {_options(matches)}. Which one did you mean?")
        elif matches[0].code not in tickers:
            tickers.append(matches[0].code)
            companies[matches[0].code] = matches[0].name

    if not plan.company_mentions:
        problems.append("Which Bursa Malaysia company would you like me to research?")

    # TODO(week 1): tag the Langfuse trace with the resolved tickers (see Langfuse docs on
    # updating trace attributes from inside a LangChain run).
    return {
        **fresh,
        "tickers": tickers,
        "companies": companies,
        "agents_to_run": agents if tickers else [],
        "scope_error": " ".join(problems) or None,
    }


def _options(matches: list[TickerMatch], n: int = 3) -> str:
    return " or ".join(f"{m.name} ({m.code})" for m in matches[:n])
