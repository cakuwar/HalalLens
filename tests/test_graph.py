"""Graph wiring tests with stub nodes: no LLM, no network."""

from langgraph.checkpoint.memory import InMemorySaver
from langgraph.types import Command

import app.graph.graph as graph_module
from app.config import settings


def test_route_to_agents():
    assert graph_module.route_to_agents({"agents_to_run": ["shariah", "news"]}) == ["shariah", "news"]
    assert graph_module.route_to_agents({"agents_to_run": []}) == ["writer"]


def test_full_run_pauses_for_review_then_revises_and_approves(monkeypatch, tmp_path):
    calls: list[str] = []

    def fake_supervisor(state):
        calls.append("supervisor")
        agents = ["news"] if state.get("feedback") else ["shariah", "technical", "news"]
        return {"tickers": ["5347"], "companies": {"5347": "Tenaga"}, "agents_to_run": agents}

    def fake_agent(name):
        def node(state):
            calls.append(name)
            return {name: {"5347": {"ok": True}}}

        return node

    def fake_writer(state):
        calls.append("writer")
        return {"draft": f"draft r{state.get('revision', 0)}"}

    monkeypatch.setattr(graph_module, "supervisor", fake_supervisor)
    monkeypatch.setattr(graph_module, "shariah_agent", fake_agent("shariah"))
    monkeypatch.setattr(graph_module, "technical_agent", fake_agent("technical"))
    monkeypatch.setattr(graph_module, "news_agent", fake_agent("news"))
    monkeypatch.setattr(graph_module, "writer", fake_writer)
    monkeypatch.setattr(settings, "briefs_dir", tmp_path)

    graph = graph_module.build_graph(InMemorySaver())
    config = {"configurable": {"thread_id": "test-thread"}}

    # 1. Runs all three agents, the writer once, then pauses at human_review
    graph.invoke({"query": "Analyse Tenaga"}, config)
    assert graph.get_state(config).next == ("human_review",)
    assert sorted(calls) == sorted(["supervisor", "shariah", "technical", "news", "writer"])

    # 2. Revise: only the agent the supervisor picks re-runs, then it pauses again
    calls.clear()
    graph.invoke(Command(resume={"action": "revise", "feedback": "more news"}), config)
    state = graph.get_state(config)
    assert state.next == ("human_review",)
    assert state.values["revision"] == 1
    assert calls == ["supervisor", "news", "writer"]

    # 3. Approve: finalize saves the brief and the run ends
    result = graph.invoke(Command(resume={"action": "approve"}), config)
    assert result["final_brief"] == "draft r1"
    assert graph.get_state(config).next == ()
    assert len(list(tmp_path.glob("*_5347_*.md"))) == 1


def test_revision_cap_forces_finalize(monkeypatch, tmp_path):
    monkeypatch.setattr(
        graph_module,
        "supervisor",
        lambda s: {"tickers": ["5347"], "companies": {}, "agents_to_run": ["shariah"]},
    )
    monkeypatch.setattr(graph_module, "shariah_agent", lambda s: {"shariah": {}})
    monkeypatch.setattr(graph_module, "writer", lambda s: {"draft": "d"})
    monkeypatch.setattr(settings, "briefs_dir", tmp_path)

    graph = graph_module.build_graph(InMemorySaver())
    config = {"configurable": {"thread_id": "cap"}}
    graph.invoke({"query": "Analyse Tenaga"}, config)
    for _ in range(settings.max_revisions):
        graph.invoke(Command(resume={"action": "revise", "feedback": "again"}), config)
    # Revisions are used up, so another "revise" finalizes instead of looping again
    result = graph.invoke(Command(resume={"action": "revise", "feedback": "again"}), config)
    assert result["final_brief"] == "d"
