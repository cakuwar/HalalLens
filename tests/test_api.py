"""API + SSE protocol tests with stub graph nodes: no LLM, no network.

The React UI depends on this event protocol, so these tests pin it down.
"""

import json
from datetime import date

import pandas as pd
import pytest
from fastapi.testclient import TestClient
from langgraph.checkpoint.memory import InMemorySaver

import app.api.main as api
import app.graph.graph as graph_module
from app.brief import build_brief
from app.config import settings
from app.tools.indicators import compute_indicators, price_chart
from app.tools.shariah_lookup import next_sc_update

SHARIAH = {
    "code": "5347",
    "name": "Tenaga Nasional Bhd",
    "status": "Compliant",
    "list_date": "2025-11-28",
    "sector": "Utilities",
    "market": "Main",
    "source": "Securities Commission Malaysia, List of Shariah-compliant Securities",
    "note": None,
}
TECHNICAL = {
    "price": 13.0,
    "supports": [12.82, 12.8],
    "resistances": [13.4],
    "ma20": 13.135,
    "ma50": 13.254,
    "rsi14": 40.0,
    "trend": "downtrend",
    "patterns": [{"date": "2026-11-06", "pattern": "doji"}],
    "as_of": "2026-11-06",
    "bars": 247,
    "stale": False,
    "source": "Yahoo Finance via yfinance",
    "explanation": {"trend_summary": "Below both averages.", "confidence": "high"},
    "chart": {"dates": ["2026-11-05", "2026-11-06"], "close": [12.9, 13.0], "ma20": [None, 13.1], "ma50": [None, 13.2]},
}
NEWS = {
    "headlines": [
        {"title": "Tenaga capex", "url": "https://a.example", "source": "thestar.com.my", "snippet": "s", "published_date": None},
        {"title": "Tariff review", "url": "https://b.example", "source": "bernama.com", "snippet": "s", "published_date": None},
        {"title": "Unrelated", "url": "https://c.example", "source": "nst.com.my", "snippet": "s", "published_date": None},
    ],
    "summary": "Capex news.",
    "sentiment": "neutral",
    "key_points": [{"claim": "Capex rising", "sources": [1]}],
    "confidence": "medium",
    "confidence_note": "Two relevant headlines.",
}
DRAFT = (
    "### Tenaga Nasional Bhd (5347)\n**News and sentiment**: tariff review [2].\n\n"
    "## Sources\n- [1] Tenaga capex\n\n---\n*Research only.*"
)


@pytest.fixture
def client(monkeypatch, tmp_path):
    def supervisor(state):
        if state.get("feedback"):
            return {"agents_to_run": ["news"], "scope_error": None}
        return {
            "tickers": ["5347"],
            "companies": {"5347": "Tenaga Nasional Bhd"},
            "agents_to_run": ["shariah", "technical", "news"],
            "scope_error": None,
        }

    monkeypatch.setattr(graph_module, "supervisor", supervisor)
    monkeypatch.setattr(graph_module, "shariah_agent", lambda s: {"shariah": {"5347": SHARIAH}})
    monkeypatch.setattr(graph_module, "technical_agent", lambda s: {"technical": {"5347": TECHNICAL}})
    monkeypatch.setattr(graph_module, "news_agent", lambda s: {"news": {"5347": NEWS}})
    monkeypatch.setattr(graph_module, "writer", lambda s: {"draft": DRAFT})
    monkeypatch.setattr(settings, "briefs_dir", tmp_path)
    monkeypatch.setattr(settings, "langfuse_public_key", None)

    graph = graph_module.build_graph(InMemorySaver())
    monkeypatch.setattr(api, "get_graph", lambda: graph)
    return TestClient(api.app)


def events(response) -> list[dict]:
    return [
        json.loads(line.removeprefix("data:").strip())
        for line in response.text.splitlines()
        if line.startswith("data:")
    ]


def test_research_streams_running_and_done_events_then_interrupt(client):
    evs = events(client.post("/research", json={"query": "Analyse Tenaga", "thread_id": "t1"}))

    assert evs[0] == {"type": "start", "threadId": "t1"}
    node_events = [(e["node"], e["status"]) for e in evs if e["type"] == "node"]
    for node in ("supervisor", "shariah", "technical", "news", "writer"):
        assert node_events.index((node, "running")) < node_events.index((node, "done"))

    supervisor_done = next(e for e in evs if e.get("node") == "supervisor" and e["status"] == "done")
    assert supervisor_done["agents"] == ["shariah", "technical", "news"]
    assert "Tenaga Nasional Bhd · 5347" in supervisor_done["detail"]

    interrupt = evs[-1]
    assert interrupt["type"] == "interrupt" and interrupt["version"] == 1
    company = interrupt["brief"]["companies"][0]
    assert company["shariah"]["status"] == "compliant"
    assert company["market"] == "Main" and company["sector"] == "Utilities"
    assert company["technical"]["chart"]["close"] == [12.9, 13.0]
    # Only key-point sources count as used; the writer's "[2]" mention alone does not.
    assert [h["cited"] for h in company["news"]["headlines"]] == [True, False, False]
    assert "## Sources" not in interrupt["brief"]["narrative"]


def test_revise_then_approve_saves_markdown_and_json(client, tmp_path):
    client.post("/research", json={"query": "Analyse Tenaga", "thread_id": "t2"})

    revised = events(client.post("/resume/t2", json={"action": "revise", "feedback": "more news"}))
    ran = {e["node"] for e in revised if e["type"] == "node" and e["status"] == "running"}
    assert ran == {"supervisor", "news", "writer"}
    assert revised[-1]["type"] == "interrupt" and revised[-1]["version"] == 2

    final = events(client.post("/resume/t2", json={"action": "approve"}))[-1]
    assert final["type"] == "final" and final["brief"]["status"] == "approved"
    saved_id = final["savedId"]
    assert (tmp_path / f"{saved_id}.md").exists() and (tmp_path / f"{saved_id}.json").exists()

    listed = client.get("/briefs").json()
    assert listed[0]["savedId"] == saved_id
    assert listed[0]["companies"][0]["shariahStatus"] == "compliant"
    assert client.get(f"/briefs/{saved_id}").json()["companies"][0]["code"] == "5347"


def test_resume_rejects_thread_not_waiting_and_bad_brief_ids(client):
    assert client.post("/resume/nope", json={"action": "approve"}).status_code == 409
    assert client.get("/briefs/..%2Fsecrets").status_code in (400, 404)
    assert client.get("/briefs/missing-id").status_code == 404


def test_config_reports_sc_list_and_revision_cap(client):
    cfg = client.get("/config").json()
    assert cfg["maxRevisions"] == settings.max_revisions
    assert cfg["langfuseSessionUrl"] is None  # Langfuse disabled in this test
    assert date.fromisoformat(cfg["nextScUpdate"]) >= date.today()


def test_build_brief_tolerates_missing_and_failed_sections():
    brief = build_brief(
        {
            "query": "Analyse Tenaga",
            "tickers": ["5347"],
            "shariah": {"5347": {"error": "list missing"}},
            "technical": {},
            "draft": "",
        }
    )
    company = brief["companies"][0]
    assert company["shariah"] == {"error": "list missing"}
    assert company["technical"] is None and company["news"] is None


def test_next_sc_update_is_last_friday_of_may_or_november():
    assert next_sc_update(date(2026, 11, 6)) == date(2026, 11, 27)
    assert next_sc_update(date(2025, 11, 28)) == date(2025, 11, 28)
    assert next_sc_update(date(2026, 12, 1)) == date(2027, 5, 28)


def test_price_chart_matches_indicator_facts(price_df: pd.DataFrame):
    chart = price_chart(price_df, days=60)
    facts = compute_indicators(price_df)
    assert len(chart["dates"]) == len(chart["close"]) == len(chart["ma20"]) == 60
    assert chart["close"][-1] == facts["price"]
    assert chart["ma20"][-1] == facts["ma20"] and chart["ma50"][-1] == facts["ma50"]


def test_cors_origin_list_parsing(monkeypatch):
    monkeypatch.setattr(settings, "cors_origins", " https://halallens.vercel.app/ , http://localhost:5180,")
    assert settings.cors_origin_list == ["https://halallens.vercel.app", "http://localhost:5180"]
