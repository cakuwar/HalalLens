"""Human-in-the-loop review and the final save.

interrupt() pauses the run and saves state through the checkpointer. The API
continues it later with graph.invoke(Command(resume={...}), config).
"""

import json
import re
from datetime import datetime
from typing import Literal

from langchain_core.messages import AIMessage
from langgraph.config import get_config
from langgraph.types import Command, interrupt

from app.config import settings
from app.graph.state import ResearchState


def human_review(state: ResearchState) -> Command[Literal["finalize", "supervisor"]]:
    revision = state.get("revision", 0)
    decision = interrupt(
        {
            "draft": state["draft"],
            "revision": revision,
            "max_revisions": settings.max_revisions,
            "question": "Approve, or tell me what to dig into?",
        }
    )
    # Expected resume payload: {"action": "approve"} or {"action": "revise", "feedback": "..."}
    decision = decision if isinstance(decision, dict) else {"action": "approve"}

    if decision.get("action") == "approve" or revision >= settings.max_revisions:
        return Command(goto="finalize")
    return Command(
        goto="supervisor",
        update={"feedback": decision.get("feedback") or "Dig deeper.", "revision": revision + 1},
    )


def finalize(state: ResearchState) -> dict:
    brief = state["draft"]
    saved_id = _save(state) if state.get("tickers") else None
    return {
        "final_brief": brief,
        "messages": [AIMessage(content=brief)],
        "feedback": None,
        "revision": 0,
        "saved_id": saved_id,
    }


def _save(state: ResearchState) -> str:
    """Write the approved brief to data/briefs/ as Markdown plus the structured JSON the UI renders.

    TODO(week 6): also store it in Postgres.
    """
    from app.brief import build_brief  # local import: app.brief imports the writer module

    try:
        thread_id = str(get_config()["configurable"].get("thread_id", "local"))
    except Exception:  # called outside a graph run (e.g. a unit test)
        thread_id = "local"
    safe_thread = re.sub(r"[^A-Za-z0-9_-]", "", thread_id)[:12] or "local"
    saved_id = f"{datetime.now():%Y%m%d-%H%M%S}_{'-'.join(state['tickers'])}_{safe_thread}"

    settings.briefs_dir.mkdir(parents=True, exist_ok=True)
    (settings.briefs_dir / f"{saved_id}.md").write_text(state["draft"], encoding="utf-8")
    structured = build_brief(state, status="approved", thread_id=thread_id, saved_id=saved_id)
    (settings.briefs_dir / f"{saved_id}.json").write_text(
        json.dumps(structured, ensure_ascii=False, indent=1), encoding="utf-8"
    )
    return saved_id
