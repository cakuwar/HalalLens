"""Turn graph state into the structured brief the web UI renders (and that saved briefs store).

Every value here is copied from tool output or the writer's text; nothing is computed
or invented. Missing data stays missing (None), so the UI can say so.
"""

from datetime import UTC, datetime
from typing import Any

from app.graph.writer import DISCLAIMER

SOURCES_HEADING = "\n## Sources"


def build_brief(
    values: dict[str, Any],
    *,
    status: str = "draft",
    thread_id: str | None = None,
    saved_id: str | None = None,
) -> dict[str, Any]:
    draft = values.get("final_brief") or values.get("draft") or ""
    narrative = draft.split(SOURCES_HEADING, 1)[0].split("\n---\n", 1)[0].strip()
    tickers = values.get("tickers") or []
    return {
        "query": values.get("query", ""),
        "threadId": thread_id,
        "savedId": saved_id or values.get("saved_id"),
        "status": status,
        "version": (values.get("revision") or 0) + 1,
        "generatedAt": datetime.now(UTC).isoformat(timespec="seconds"),
        "scopeMessage": values.get("scope_error"),
        "narrative": narrative,
        "markdown": draft,
        "disclaimer": DISCLAIMER.strip("*"),
        "companies": [_company(code, values) for code in tickers],
    }


def _company(code: str, values: dict[str, Any]) -> dict[str, Any]:
    shariah = (values.get("shariah") or {}).get(code)
    technical = (values.get("technical") or {}).get(code)
    news = (values.get("news") or {}).get(code)
    shariah = shariah if isinstance(shariah, dict) else None
    return {
        "code": code,
        "symbol": f"{code}.KL",
        "name": (values.get("companies") or {}).get(code) or (shariah or {}).get("name") or code,
        "sector": (shariah or {}).get("sector"),
        "market": (shariah or {}).get("market"),
        "shariah": _shariah(shariah),
        "technical": _technical(technical),
        "news": _news(news),
    }


def _shariah(s: dict | None) -> dict | None:
    if not s:
        return None
    if "error" in s:
        return {"error": s["error"]}
    return {
        "status": "compliant" if s.get("status") == "Compliant" else "non_compliant",
        "listDate": s.get("list_date"),
        "source": s.get("source"),
        "note": s.get("note"),
        "reclassified": bool(s.get("note") and "Reclassified" in s["note"]),
    }


def _technical(t: dict | None) -> dict | None:
    if not isinstance(t, dict) or not t:
        return None
    if "error" in t:
        return {"error": t["error"]}
    e = t.get("explanation") or {}
    return {
        "price": t.get("price"),
        "supports": t.get("supports") or [],
        "resistances": t.get("resistances") or [],
        "ma20": t.get("ma20"),
        "ma50": t.get("ma50"),
        "rsi14": t.get("rsi14"),
        "trend": t.get("trend"),
        "patterns": t.get("patterns") or [],
        "asOf": t.get("as_of"),
        "bars": t.get("bars"),
        "stale": bool(t.get("stale")),
        "source": t.get("source"),
        "chart": t.get("chart"),
        "explanation": {
            "trendSummary": e.get("trend_summary"),
            "levelsCommentary": e.get("levels_commentary"),
            "momentumCommentary": e.get("momentum_commentary"),
            "candleCommentary": e.get("candle_commentary"),
            "confidence": e.get("confidence"),
            "confidenceNote": e.get("confidence_note"),
        }
        if e
        else None,
    }


def _news(n: dict | None) -> dict | None:
    if not isinstance(n, dict) or not n:
        return None
    if "error" in n:
        return {"error": n["error"], "headlines": []}
    key_points = [
        {"claim": kp.get("claim", ""), "sources": [int(s) for s in kp.get("sources") or []]}
        for kp in n.get("key_points") or []
    ]
    # "Used" means the news agent based a key point on it. The writer may also mention a
    # headline (e.g. to say it is irrelevant), which doesn't make it evidence.
    cited = {s for kp in key_points for s in kp["sources"]}
    return {
        "summary": n.get("summary"),
        "sentiment": n.get("sentiment"),
        "confidence": n.get("confidence"),
        "confidenceNote": n.get("confidence_note"),
        "keyPoints": key_points,
        "headlines": [
            {
                "n": i,
                "title": h.get("title"),
                "url": h.get("url"),
                "source": h.get("source"),
                "publishedDate": h.get("published_date"),
                "snippet": h.get("snippet"),
                "cited": i in cited,
            }
            for i, h in enumerate(n.get("headlines") or [], start=1)
        ],
    }
