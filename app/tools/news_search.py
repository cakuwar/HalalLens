"""Recent news from Malaysian business sites through Tavily (1,000 free credits a month)."""

from urllib.parse import urlparse

from langchain_core.tools import tool

from app.config import settings

MALAYSIAN_NEWS_DOMAINS = [
    "theedgemalaysia.com",
    "thestar.com.my",
    "bernama.com",
    "nst.com.my",
]


class NewsSearchError(RuntimeError):
    pass


def search_news(
    company: str, code: str, *, extra: str | None = None, max_results: int = 8
) -> list[dict]:
    """Headlines as [{title, url, snippet, source, published_date}]. `extra` = reviewer feedback."""
    if not settings.tavily_api_key:
        raise NewsSearchError("TAVILY_API_KEY is not set.")

    from langchain_tavily import TavilySearch

    search = TavilySearch(
        max_results=max_results,
        topic="news",
        time_range="month",
        include_domains=MALAYSIAN_NEWS_DOMAINS,
    )
    query = f"{company} Bursa Malaysia {code}"
    if extra:
        query += f" {extra[:100]}"

    try:
        response = search.invoke({"query": query})
    except Exception as exc:
        raise NewsSearchError(f"Tavily search failed: {exc}") from exc
    if isinstance(response, dict) and response.get("error"):
        raise NewsSearchError(f"Tavily search failed: {response['error']}")

    results = response.get("results", []) if isinstance(response, dict) else []
    return [
        {
            "title": r.get("title", "").strip(),
            "url": r.get("url", ""),
            "snippet": (r.get("content") or "")[:500],
            "source": urlparse(r.get("url", "")).netloc.removeprefix("www."),
            "published_date": r.get("published_date"),
        }
        for r in results
        if r.get("url")
    ]


@tool("news_search")
def news_search_tool(company: str, code: str) -> list[dict]:
    """Recent headlines about a Bursa company from The Edge, The Star, Bernama and NST."""
    return search_news(company, code)
