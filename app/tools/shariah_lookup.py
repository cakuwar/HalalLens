"""Shariah status and ticker resolution, both backed by the official SC Malaysia list.

data/shariah_list.csv is produced from the SC PDF by scripts/parse_sc_list.py.
The SC list contains only Shariah-compliant securities, so a Bursa stock that is
not on it is non-compliant as at that list date.

data/aliases.json maps common names to codes ("Maybank" -> 1155). It also covers
well-known stocks that are not on the list, such as conventional banks, so they
can still be resolved.
TODO(week 1+): add a full Bursa universe file so every listed stock resolves, not only aliased ones.
"""

import calendar
import csv
import json
import re
from datetime import date, timedelta
from functools import lru_cache
from pathlib import Path
from typing import Literal

from langchain_core.tools import tool
from pydantic import BaseModel
from rapidfuzz import fuzz, process

from app.config import settings

SC_SOURCE = "Securities Commission Malaysia, List of Shariah-compliant Securities"


class ShariahListMissing(RuntimeError):
    """data/shariah_list.csv has not been generated yet."""


class ShariahRecord(BaseModel):
    code: str
    name: str
    status: Literal["Compliant", "Non-compliant"]
    list_date: str  # always printed in the brief
    sector: str | None = None
    market: str | None = None  # Main / ACE / LEAP
    source: str = SC_SOURCE
    note: str | None = None


class TickerMatch(BaseModel):
    code: str
    name: str
    score: float  # rapidfuzz score, 0-100
    matched_on: str


# --- Loading -------------------------------------------------------------------


@lru_cache
def load_shariah_list(path: Path | None = None) -> dict[str, dict]:
    """code -> CSV row (code, name, sector, status, list_date)."""
    path = Path(path or settings.shariah_csv)
    if not path.exists():
        return {}
    with path.open(newline="", encoding="utf-8") as f:
        return {row["code"].strip(): row for row in csv.DictReader(f) if row.get("code")}


@lru_cache
def load_aliases(path: Path | None = None) -> dict[str, dict]:
    """code -> {"name": ..., "aliases": [...]}. Keys starting with "_" are comments."""
    path = Path(path or settings.aliases_json)
    data = json.loads(path.read_text(encoding="utf-8"))
    return {code: info for code, info in data.items() if not code.startswith("_")}


# --- Shariah lookup -------------------------------------------------------------------


def shariah_lookup(code: str, *, csv_path: Path | None = None) -> ShariahRecord:
    sc_list = load_shariah_list(csv_path)
    if not sc_list:
        raise ShariahListMissing(
            "data/shariah_list.csv is empty. Run scripts/parse_sc_list.py on the latest SC list."
        )
    list_date = next(iter(sc_list.values()))["list_date"]

    if row := sc_list.get(code):
        reclassified = row["status"] == "Non-compliant"  # from Table 2 of the SC update
        return ShariahRecord(
            code=code,
            name=row["name"],
            status=row["status"],
            list_date=row["list_date"],
            sector=row.get("sector") or None,
            market=row.get("market") or None,
            note=(
                f"Reclassified as Shariah non-compliant in the SC update dated {row['list_date']}."
                if reclassified
                else None
            ),
        )

    name = load_aliases().get(code, {}).get("name", code)
    return ShariahRecord(
        code=code,
        name=name,
        status="Non-compliant",
        list_date=list_date,
        note=f"Not on the SC list dated {list_date}, which includes only Shariah-compliant securities.",
    )


def next_sc_update(today: date) -> date:
    """The SC publishes updated lists on the last Friday of May and November."""
    for year in (today.year, today.year + 1):
        for month in (5, 11):
            last_day = date(year, month, calendar.monthrange(year, month)[1])
            last_friday = last_day - timedelta(days=(last_day.weekday() - 4) % 7)
            if last_friday >= today:
                return last_friday
    raise AssertionError("unreachable")


# --- Ticker resolution --------------------------------------------------------------


def _normalise(text: str) -> str:
    """Lowercase, punctuation to spaces ("UMS-Neiken" -> "ums neiken"), drop "Bhd"/"Berhad"/"Ltd"."""
    text = re.sub(r"[^a-z0-9]+", " ", text.lower())
    text = re.sub(r"\b(berhad|bhd|ltd)\b", "", text)
    return re.sub(r"\s+", " ", text).strip()


@lru_cache
def _choices(csv_path: Path | None, aliases_path: Path | None) -> dict[str, tuple[str, str]]:
    """normalised name or alias -> (code, display name)."""
    choices: dict[str, tuple[str, str]] = {}
    for code, row in load_shariah_list(csv_path).items():
        choices[_normalise(row["name"])] = (code, row["name"])
    for code, info in load_aliases(aliases_path).items():
        choices.setdefault(_normalise(info["name"]), (code, info["name"]))
        for alias in info.get("aliases", []):
            choices[_normalise(alias)] = (code, info["name"])
    return choices


def resolve_ticker(
    query: str,
    *,
    limit: int = 5,
    csv_path: Path | None = None,
    aliases_path: Path | None = None,
) -> list[TickerMatch]:
    """Best matching Bursa stocks for a name, short name, typo or code. Empty list = no match."""
    q = _normalise(query)
    if not q:
        return []

    # Exact Bursa code: "1155", "1155.KL", or a 5-digit LEAP code such as "03012"
    if m := re.fullmatch(r"(\d{4,5})( kl)?", q):
        code = m.group(1)
        sc_row = load_shariah_list(csv_path).get(code)
        alias = load_aliases(aliases_path).get(code)
        name = (sc_row or {}).get("name") or (alias or {}).get("name")
        return [TickerMatch(code=code, name=name, score=100.0, matched_on=code)] if name else []

    choices = _choices(csv_path, aliases_path)
    hits = process.extract(
        q, list(choices), scorer=fuzz.WRatio, limit=limit * 3, score_cutoff=settings.min_match_score
    )
    best: dict[str, TickerMatch] = {}
    for text, score, _ in hits:
        code, name = choices[text]
        if code not in best or score > best[code].score:
            best[code] = TickerMatch(code=code, name=name, score=round(score, 1), matched_on=text)
    return sorted(best.values(), key=lambda match: -match.score)[:limit]


def is_ambiguous(matches: list[TickerMatch], margin: float = 5.0) -> bool:
    """True when the top two candidates are different stocks with near-equal scores ("YTL")."""
    return len(matches) > 1 and matches[0].score - matches[1].score < margin


# --- LLM-callable wrappers --------------------------------------------------------------


@tool("resolve_ticker")
def resolve_ticker_tool(company: str) -> list[dict]:
    """Find the Bursa Malaysia stock code for a company name, short name or code (typos allowed)."""
    return [m.model_dump() for m in resolve_ticker(company)]


@tool("shariah_lookup")
def shariah_lookup_tool(code: str) -> dict:
    """Official SC Malaysia Shariah status for a 4-digit Bursa stock code, with the list date."""
    return shariah_lookup(code).model_dump()
