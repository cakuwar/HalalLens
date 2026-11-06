"""Builds and compiles the HalalLens StateGraph. Open this file to see the whole system.

    START -> supervisor -> (shariah | technical | news, in parallel) -> writer
          -> human_review --approve--> finalize -> END
                          --revise (max 2)--> supervisor
"""

import sqlite3
from functools import lru_cache

from langgraph.checkpoint.base import BaseCheckpointSaver
from langgraph.graph import END, START, StateGraph

from app.config import settings
from app.graph.agents.news import news_agent
from app.graph.agents.shariah import shariah_agent
from app.graph.agents.technical import technical_agent
from app.graph.review import finalize, human_review
from app.graph.state import ALL_AGENTS, ResearchState
from app.graph.supervisor import supervisor
from app.graph.writer import writer


def route_to_agents(state: ResearchState) -> list[str]:
    """Returning a list fans out: every node named runs in parallel in the same step."""
    agents = state.get("agents_to_run") or []
    # Nothing to research (out of scope, ambiguous name): go straight to the writer to explain.
    return list(agents) if agents else ["writer"]


def build_graph(checkpointer: BaseCheckpointSaver | None = None):
    builder = StateGraph(ResearchState)
    builder.add_node("supervisor", supervisor)
    builder.add_node("shariah", shariah_agent)
    builder.add_node("technical", technical_agent)
    builder.add_node("news", news_agent)
    builder.add_node("writer", writer)
    builder.add_node("human_review", human_review)  # returns Command(goto=...), no static out-edge
    builder.add_node("finalize", finalize)

    builder.add_edge(START, "supervisor")
    builder.add_conditional_edges("supervisor", route_to_agents, [*ALL_AGENTS, "writer"])
    for agent in ALL_AGENTS:
        # Separate edges (not add_edge([...], "writer")) so the writer still runs when the
        # supervisor picks only a subset: the agents finish in the same step, then the writer runs once.
        builder.add_edge(agent, "writer")
    builder.add_edge("writer", "human_review")
    builder.add_edge("finalize", END)

    return builder.compile(checkpointer=checkpointer)


def make_checkpointer() -> BaseCheckpointSaver:
    """SqliteSaver for dev; PostgresSaver when DATABASE_URL is set (docker / deploy)."""
    if settings.database_url:
        # TODO(week 6): verify against the langgraph-checkpoint-postgres docs for your version.
        from langgraph.checkpoint.postgres import PostgresSaver
        from psycopg import Connection
        from psycopg.rows import dict_row

        conn = Connection.connect(
            settings.database_url, autocommit=True, prepare_threshold=0, row_factory=dict_row
        )
        saver = PostgresSaver(conn)
        saver.setup()  # creates the checkpoint tables on first run
        return saver

    from langgraph.checkpoint.sqlite import SqliteSaver

    # Note: SqliteSaver.from_conn_string(...) is a context manager, not a saver,
    # so pass a long-lived connection when the graph lives for the whole process.
    conn = sqlite3.connect(settings.sqlite_path, check_same_thread=False)
    return SqliteSaver(conn)


@lru_cache(maxsize=1)
def get_graph():
    """The app-wide compiled graph (built lazily so importing this module has no side effects)."""
    return build_graph(make_checkpointer())
