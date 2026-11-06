"""FastAPI backend: start research, resume after review, stream node-by-node progress over SSE.

Run:  uvicorn app.api.main:app --reload --port 8010   (port 8000 is left for other projects)

Every SSE message is `event: <type>` plus `data: <JSON with the same "type">`:
  {"type": "start",     "threadId"}
  {"type": "node",      "node", "status": "running" | "done", "detail"?, "agents"?}
  {"type": "interrupt", "threadId", "version", "maxRevisions", "brief"}   paused at human_review
  {"type": "final",     "threadId", "savedId", "brief"}                   approved and saved
  {"type": "error",     "message"}
"node" is one of supervisor | shariah | technical | news | writer. The brief is built by
app/brief.py from the graph state, so every number in it comes from a tool.
"""

import json
import os
import re
import uuid
from collections.abc import Iterator
from datetime import date
from functools import lru_cache
from typing import Any, Literal

from fastapi import FastAPI, HTTPException
from fastapi.responses import HTMLResponse, StreamingResponse
from langgraph.types import Command
from pydantic import BaseModel, Field

from app.brief import build_brief
from app.config import run_config, settings
from app.graph.graph import get_graph
from app.tools.shariah_lookup import load_shariah_list, next_sc_update

app = FastAPI(title="HalalLens API", version="0.2.0")

NODES = ("supervisor", "shariah", "technical", "news", "writer")
SAVED_ID_RE = re.compile(r"^[A-Za-z0-9_-]{1,120}$")


class ResearchRequest(BaseModel):
    query: str = Field(min_length=2, max_length=500)
    thread_id: str | None = None  # reuse it to ask a follow-up in the same session
    user_id: str | None = None


class ResumeRequest(BaseModel):
    action: Literal["approve", "revise"]
    feedback: str | None = None
    user_id: str | None = None


# --- Endpoints ---------------------------------------------------------------------


ROOT_PAGE = """<!doctype html><html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1"><title>HalalLens API</title>
<style>body{font:16px/1.6 system-ui,sans-serif;max-width:560px;margin:12vh auto;padding:0 20px;color:#12201a}
a{color:#0e5b43;font-weight:600}code{background:#eef2ed;padding:2px 6px;border-radius:6px}</style></head><body>
<h1>HalalLens API is running</h1>
<p>This port serves the API only. The web app runs separately:</p>
<p><code>cd ui/halallens-ui</code> then <code>npm run dev</code>, and open
<a href="http://localhost:5180">http://localhost:5180</a>.</p>
<p>API docs: <a href="/docs">/docs</a> &middot; health: <a href="/health">/health</a></p>
</body></html>"""


@app.get("/", response_class=HTMLResponse, include_in_schema=False)
def root() -> str:
    """Opening the API port in a browser explains where the web app is, instead of a bare 404."""
    return ROOT_PAGE


@app.get("/health")
def health() -> dict:
    return {"status": "ok"}


@app.get("/config")
def ui_config() -> dict:
    """Facts the UI shows around the research: SC list date, revision cap, models, trace links."""
    sc_list = load_shariah_list()
    first = next(iter(sc_list.values()), None)
    return {
        "scListDate": first["list_date"] if first else None,
        "scCompliantCount": sum(1 for row in sc_list.values() if row.get("status") == "Compliant"),
        "nextScUpdate": next_sc_update(date.today()).isoformat(),
        "maxRevisions": settings.max_revisions,
        "models": {"agent": settings.agent_model, "writer": settings.writer_model},
        "langfuseSessionUrl": _langfuse_session_url(),
        "version": settings.app_version,
    }


@app.post("/research")
def research(req: ResearchRequest) -> StreamingResponse:
    # TODO(week 6): rate limit before going public (e.g. 5 analyses per IP per day).
    thread_id = req.thread_id or uuid.uuid4().hex[:12]
    graph_input = {"query": req.query, "feedback": None, "revision": 0}
    return _sse_response(graph_input, thread_id, req.user_id)


@app.post("/resume/{thread_id}")
def resume(thread_id: str, req: ResumeRequest) -> StreamingResponse:
    snapshot = get_graph().get_state({"configurable": {"thread_id": thread_id}})
    if "human_review" not in snapshot.next:
        raise HTTPException(status_code=409, detail="This thread is not waiting for review.")
    command = Command(resume={"action": req.action, "feedback": req.feedback})
    return _sse_response(command, thread_id, req.user_id)


@app.get("/threads/{thread_id}")
def get_thread(thread_id: str) -> dict:
    snapshot = get_graph().get_state({"configurable": {"thread_id": thread_id}})
    if not snapshot.values:
        raise HTTPException(status_code=404, detail="Unknown thread.")
    return {
        "threadId": thread_id,
        "next": list(snapshot.next),
        "brief": build_brief(snapshot.values, thread_id=thread_id),
    }


@app.get("/briefs")
def list_briefs(limit: int = 50) -> list[dict]:
    """Approved briefs saved by the finalize node, newest first."""
    if not settings.briefs_dir.exists():
        return []
    files = sorted(settings.briefs_dir.glob("*.json"), key=lambda p: p.stat().st_mtime, reverse=True)
    items = []
    for path in files[:limit]:
        try:
            brief = json.loads(path.read_text(encoding="utf-8"))
        except (OSError, json.JSONDecodeError):
            continue
        items.append(
            {
                "savedId": path.stem,
                "query": brief.get("query"),
                "generatedAt": brief.get("generatedAt"),
                "companies": [
                    {
                        "code": c.get("code"),
                        "name": c.get("name"),
                        "shariahStatus": (c.get("shariah") or {}).get("status"),
                    }
                    for c in brief.get("companies", [])
                ],
            }
        )
    return items


@app.get("/briefs/{saved_id}")
def get_brief(saved_id: str) -> dict:
    if not SAVED_ID_RE.fullmatch(saved_id):
        raise HTTPException(status_code=400, detail="Invalid brief id.")
    path = settings.briefs_dir / f"{saved_id}.json"
    if not path.exists():
        raise HTTPException(status_code=404, detail="Brief not found.")
    return json.loads(path.read_text(encoding="utf-8"))


# --- Streaming ----------------------------------------------------------------------


def _sse_response(graph_input: Any, thread_id: str, user_id: str | None) -> StreamingResponse:
    return StreamingResponse(
        _stream(graph_input, thread_id, user_id),
        media_type="text/event-stream",
        headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
    )


def _stream(graph_input: Any, thread_id: str, user_id: str | None) -> Iterator[str]:
    graph = get_graph()
    config = run_config(thread_id, user_id=user_id)
    paused = finished = False
    yield _event({"type": "start", "threadId": thread_id})
    try:
        # "tasks" reports each node as it starts; "updates" reports what it wrote when it ends.
        for mode, chunk in graph.stream(graph_input, config, stream_mode=["tasks", "updates"]):
            if mode == "tasks":
                if "input" in chunk and chunk["name"] in NODES:
                    yield _event({"type": "node", "node": chunk["name"], "status": "running"})
                continue
            for node, update in chunk.items():
                if node == "__interrupt__":
                    paused = True
                elif node == "finalize":
                    finished = True
                elif node in NODES:
                    yield _event({"type": "node", "node": node, "status": "done", **_detail(node, update or {})})

        values = graph.get_state(config).values
        if paused:
            yield _event(
                {
                    "type": "interrupt",
                    "threadId": thread_id,
                    "version": (values.get("revision") or 0) + 1,
                    "maxRevisions": settings.max_revisions,
                    "brief": build_brief(values, thread_id=thread_id),
                }
            )
        elif finished:
            yield _event(
                {
                    "type": "final",
                    "threadId": thread_id,
                    "savedId": values.get("saved_id"),
                    "brief": build_brief(values, status="approved", thread_id=thread_id),
                }
            )
    except Exception as exc:
        yield _event({"type": "error", "message": str(exc)})


def _detail(node: str, update: dict) -> dict:
    """One factual line for the run panel, taken from what the node wrote."""
    if node == "supervisor":
        tickers = update.get("tickers")
        agents = update.get("agents_to_run") or []
        if tickers is None:  # revise loop: same tickers, fewer agents
            return {"detail": f"Revising with {', '.join(agents) or 'no'} agents", "agents": agents}
        if not tickers:
            return {"detail": update.get("scope_error") or "Nothing to research", "agents": []}
        names = update.get("companies") or {}
        resolved = ", ".join(f"{names.get(c, c)} · {c}" for c in tickers)
        return {"detail": f"Resolved {resolved} · {len(agents)} agents", "agents": agents}

    if node == "writer":
        words = len((update.get("draft") or "").split())
        return {"detail": f"Draft ready · {words} words"}

    parts = []
    for code, result in (update.get(node) or {}).items():
        if not isinstance(result, dict) or "error" in result:
            parts.append(f"{code}: unavailable")
        elif node == "shariah":
            parts.append(f"{code} {result.get('status')} · SC list {_pretty_date(result.get('list_date'))}")
        elif node == "technical":
            parts.append(
                f"{code} RM{result.get('price')} · {result.get('trend')} · RSI {result.get('rsi14')}"
            )
        elif node == "news":
            parts.append(f"{code} {len(result.get('headlines', []))} headlines · {result.get('sentiment')}")
    return {"detail": " | ".join(parts)} if parts else {}


def _pretty_date(iso: str | None) -> str:
    try:
        d = date.fromisoformat(iso)
        return f"{d.day} {d:%b %Y}"  # "28 Nov 2025"
    except (TypeError, ValueError):
        return iso or "?"


def _event(data: dict) -> str:
    return f"event: {data['type']}\ndata: {json.dumps(data, default=str, ensure_ascii=False)}\n\n"


@lru_cache(maxsize=1)
def _langfuse_session_url() -> str | None:
    """Deep-link template for a thread's Langfuse session; "{threadId}" is filled in by the UI."""
    if not settings.langfuse_enabled:
        return None
    host = (
        os.getenv("LANGFUSE_HOST") or os.getenv("LANGFUSE_BASE_URL") or "https://cloud.langfuse.com"
    ).rstrip("/")
    try:
        from langfuse import get_client

        project_id = get_client().api.projects.get().data[0].id
        return f"{host}/project/{project_id}/sessions/{{threadId}}"
    except Exception:
        return host
