"""Daily OHLCV for Bursa stocks from Yahoo Finance (yfinance, ".KL" suffix: 1155.KL = Maybank).

yfinance is unofficial and can break or rate-limit, so each call is retried and
cached on disk for a day. If Yahoo fails, the newest cached file is used and
flagged as stale, and the brief says so.
"""

import logging
import time
from dataclasses import dataclass
from datetime import date
from pathlib import Path

import pandas as pd
from langchain_core.tools import tool

from app.config import settings

log = logging.getLogger(__name__)

SOURCE = "Yahoo Finance via yfinance"
COLUMNS = ["Open", "High", "Low", "Close", "Volume"]


class PriceDataError(RuntimeError):
    """No live data and no cached fallback."""


@dataclass
class PriceData:
    code: str
    df: pd.DataFrame  # index: Date, columns: COLUMNS
    stale: bool = False
    source: str = SOURCE


def yahoo_symbol(code: str) -> str:
    return f"{code}.KL"


def get_prices(code: str, period: str = "1y", retries: int = 3) -> PriceData:
    cache_dir = settings.cache_dir / "prices"
    today_file = cache_dir / f"{code}_{period}_{date.today():%Y%m%d}.csv"
    if today_file.exists():
        return PriceData(code, _read(today_file))

    last_error: Exception | None = None
    for attempt in range(retries):
        try:
            df = _download(code, period)
            cache_dir.mkdir(parents=True, exist_ok=True)
            df.to_csv(today_file)
            return PriceData(code, df)
        except Exception as exc:  # yfinance raises many different error types
            last_error = exc
            log.warning("yfinance %s attempt %d/%d failed: %s", code, attempt + 1, retries, exc)
            if attempt < retries - 1:
                time.sleep(2**attempt)

    cached = sorted(cache_dir.glob(f"{code}_{period}_*.csv"))
    if cached:
        log.warning("Using stale cached prices for %s: %s", code, cached[-1].name)
        return PriceData(code, _read(cached[-1]), stale=True)
    raise PriceDataError(f"Could not load prices for {yahoo_symbol(code)}: {last_error}")


def _download(code: str, period: str) -> pd.DataFrame:
    import yfinance as yf  # imported lazily: slow import, and not needed by unit tests

    df = yf.Ticker(yahoo_symbol(code)).history(period=period, auto_adjust=False)
    if df.empty:
        raise PriceDataError(f"No price data returned for {yahoo_symbol(code)}")
    df = df[COLUMNS].dropna()
    df.index = pd.DatetimeIndex(df.index).tz_localize(None)
    df.index.name = "Date"
    return df


def _read(path: Path) -> pd.DataFrame:
    return pd.read_csv(path, index_col="Date", parse_dates=True)


@tool("price_summary")
def price_summary_tool(code: str) -> dict:
    """Technical facts for a Bursa code: price, support/resistance, MA20/50, RSI14, trend, candles."""
    from app.tools.indicators import compute_indicators

    data = get_prices(code)
    return {**compute_indicators(data.df), "stale": data.stale, "source": data.source}
