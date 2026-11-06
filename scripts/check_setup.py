"""Check that HalalLens's data files and API keys work. Never prints key values.

Run from the project root with the venv active:

    python scripts/check_setup.py
    python scripts/check_setup.py --skip-llm     # don't call the LLM

Checks, in order:
  1. SC Shariah list   data/shariah_list.csv is loaded
  2. Yahoo prices      daily prices for Tenaga (5347.KL) through yfinance
  3. Tavily            one news search (uses 1 of your free monthly credits)
  4. Langfuse          login, then one test trace from a one-node graph (START -> shariah -> END)
  5. LLM               one tiny structured-output call to AGENT_MODEL (a fraction of a cent)
"""

import argparse
import os
import sys
import time
import uuid
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT))  # lets `python scripts/check_setup.py` import app/

from pydantic import BaseModel  # noqa: E402

from app.config import run_config, settings, structured_llm  # noqa: E402  (loads .env)

LLM_KEY_VARS = {
    "anthropic": "ANTHROPIC_API_KEY",
    "openai": "OPENAI_API_KEY",
    "google_genai": "GOOGLE_API_KEY",
}


class Skip(Exception):
    """The check can't run, e.g. its key isn't set."""


def check_shariah_list() -> str:
    from app.tools.shariah_lookup import load_shariah_list, shariah_lookup

    rows = load_shariah_list()
    if not rows:
        raise RuntimeError("data/shariah_list.csv is empty. Run scripts/parse_sc_list.py first.")
    tenaga = shariah_lookup("5347")
    return f"{len(rows)} rows, list dated {tenaga.list_date}. Tenaga (5347): {tenaga.status}"


def check_prices() -> str:
    from app.tools.indicators import compute_indicators
    from app.tools.prices import get_prices

    data = get_prices("5347")
    facts = compute_indicators(data.df)
    stale = " (from an old cache: Yahoo failed)" if data.stale else ""
    return f"5347.KL closed at RM{facts['price']} on {facts['as_of']}, RSI14 {facts['rsi14']}{stale}"


def check_tavily() -> str:
    if not settings.tavily_api_key:
        raise Skip("TAVILY_API_KEY is not set in .env")
    from app.tools.news_search import search_news

    headlines = search_news("Tenaga Nasional Berhad", "5347", max_results=3)
    if not headlines:
        return "connected, but no headlines in the last month for this query"
    first = headlines[0]
    return f"{len(headlines)} headlines, e.g. \"{first['title'][:70]}\" ({first['source']})"


def check_langfuse() -> str:
    if not settings.langfuse_enabled:
        raise Skip("LANGFUSE_PUBLIC_KEY / LANGFUSE_SECRET_KEY are not set in .env")
    from langfuse import get_client
    from langgraph.graph import END, START, StateGraph

    from app.graph.agents.shariah import shariah_agent
    from app.graph.state import ResearchState

    host = os.getenv("LANGFUSE_HOST") or os.getenv("LANGFUSE_BASE_URL") or "https://cloud.langfuse.com"
    client = get_client()
    if not client.auth_check():
        raise RuntimeError(f"keys rejected by {host}. Check the keys and that LANGFUSE_HOST matches your region.")

    # Week 1 "done when": a one-node graph answering a Shariah question, visible in Langfuse.
    builder = StateGraph(ResearchState)
    builder.add_node("shariah", shariah_agent)
    builder.add_edge(START, "shariah")
    builder.add_edge("shariah", END)
    graph = builder.compile()

    session_id = f"setup-check-{uuid.uuid4().hex[:8]}"
    state = graph.invoke(
        {"query": "Is Maybank Shariah-compliant?", "tickers": ["1155"]},
        run_config(session_id, user_id="setup-check", tags=["setup-check"]),
    )
    client.flush()  # send the trace before the script exits
    maybank = state["shariah"]["1155"]
    answer = maybank.get("status") or maybank.get("error")
    return f"login OK. Test trace sent: Maybank = {answer}. Look for session '{session_id}' in {host}"


def check_llm() -> str:
    provider = settings.agent_model.split(":", 1)[0]
    key_var = LLM_KEY_VARS.get(provider)
    if key_var and not os.getenv(key_var):
        raise Skip(f"{key_var} is not set in .env (needed for AGENT_MODEL={settings.agent_model})")

    class Ping(BaseModel):
        ok: bool
        word: str

    reply = structured_llm("agent", Ping).invoke("Return ok=true and word='salam'.")
    return f"{settings.agent_model} returned structured output: {reply}"


CHECKS = [
    ("SC Shariah list", check_shariah_list),
    ("Yahoo prices", check_prices),
    ("Tavily", check_tavily),
    ("Langfuse", check_langfuse),
    ("LLM", check_llm),
]


def main() -> None:
    sys.stdout.reconfigure(errors="replace")  # Windows consoles can't print every character
    parser = argparse.ArgumentParser(description="Check HalalLens data files and API keys.")
    parser.add_argument("--skip-llm", action="store_true", help="Don't call the LLM")
    args = parser.parse_args()

    failed = False
    for name, fn in CHECKS:
        start = time.perf_counter()
        try:
            if name == "LLM" and args.skip_llm:
                raise Skip("--skip-llm")
            status, detail = "PASS", fn()
        except Skip as exc:
            status, detail = "SKIP", str(exc)
        except Exception as exc:
            status, detail, failed = "FAIL", f"{type(exc).__name__}: {str(exc)[:300]}", True
        print(f"[{status}] {name:<16} {detail}  ({time.perf_counter() - start:.1f}s)")

    sys.exit(1 if failed else 0)


if __name__ == "__main__":
    main()
