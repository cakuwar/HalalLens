"""Technical indicators in pure pandas. The numbers come from here and the LLM only explains them.

Every value is a plain, rounded float, so it serialises to JSON and the
`numbers_grounded` evaluator can match it exactly against the brief.
"""

from itertools import pairwise

import pandas as pd


def support_resistance(df: pd.DataFrame, window: int = 5, top_n: int = 3) -> dict:
    """Swing lows/highs: bars that are the min/max of a centred (2*window+1)-bar window."""
    span = 2 * window + 1
    lows = df["Low"][df["Low"] == df["Low"].rolling(span, center=True).min()]
    highs = df["High"][df["High"] == df["High"].rolling(span, center=True).max()]
    price = float(df["Close"].iloc[-1])
    supports = sorted({round(float(x), 3) for x in lows if x < price}, reverse=True)[:top_n]
    resistances = sorted({round(float(x), 3) for x in highs if x > price})[:top_n]
    return {"price": round(price, 3), "supports": supports, "resistances": resistances}


def sma(close: pd.Series, n: int) -> float | None:
    if len(close) < n:
        return None
    return round(float(close.rolling(n).mean().iloc[-1]), 3)


def rsi(close: pd.Series, period: int = 14) -> float | None:
    """Wilder's RSI (exponential smoothing with alpha = 1/period)."""
    if len(close) <= period:
        return None
    delta = close.diff()
    avg_gain = delta.clip(lower=0).ewm(alpha=1 / period, min_periods=period, adjust=False).mean()
    avg_loss = (-delta.clip(upper=0)).ewm(alpha=1 / period, min_periods=period, adjust=False).mean()
    gain, loss = float(avg_gain.iloc[-1]), float(avg_loss.iloc[-1])
    if loss == 0:
        return 100.0 if gain > 0 else 50.0
    return round(100 - 100 / (1 + gain / loss), 1)


def trend(price: float, ma20: float | None, ma50: float | None) -> str:
    if ma20 is None or ma50 is None:
        return "insufficient data"
    if price > ma20 > ma50:
        return "uptrend"
    if price < ma20 < ma50:
        return "downtrend"
    return "sideways"


def candle_patterns(df: pd.DataFrame, lookback: int = 5) -> list[dict]:
    """Simple single- and two-candle patterns in the last `lookback` bars."""
    rows = list(df.tail(lookback + 1).itertuples())
    found: list[dict] = []
    for prev, cur in pairwise(rows):
        o, hi, lo, c = cur.Open, cur.High, cur.Low, cur.Close
        body, rng = abs(c - o), hi - lo
        if rng <= 0:
            continue
        upper, lower = hi - max(o, c), min(o, c) - lo
        day = pd.Timestamp(cur.Index).date().isoformat()

        if body <= 0.1 * rng:
            found.append({"date": day, "pattern": "doji"})
        elif lower >= 2 * body and upper <= body:
            found.append({"date": day, "pattern": "hammer"})
        elif upper >= 2 * body and lower <= body:
            found.append({"date": day, "pattern": "shooting star"})

        if prev.Close < prev.Open and c > o and o <= prev.Close and c >= prev.Open:
            found.append({"date": day, "pattern": "bullish engulfing"})
        elif prev.Close > prev.Open and c < o and o >= prev.Close and c <= prev.Open:
            found.append({"date": day, "pattern": "bearish engulfing"})
    return found


def price_chart(df: pd.DataFrame, days: int = 130) -> dict:
    """Recent closes plus MA20/MA50 series for the UI chart (about six months of trading days).

    Kept out of the LLM prompts: the model only sees the summary facts below.
    """
    close = df["Close"]

    def clean(series: pd.Series) -> list[float | None]:
        return [None if pd.isna(v) else round(float(v), 3) for v in series.iloc[-days:]]

    return {
        "dates": [pd.Timestamp(d).date().isoformat() for d in df.index[-days:]],
        "close": clean(close),
        "ma20": clean(close.rolling(20).mean()),
        "ma50": clean(close.rolling(50).mean()),
    }


def compute_indicators(df: pd.DataFrame) -> dict:
    """All technical facts the agent may use, from a daily OHLC DataFrame."""
    close = df["Close"]
    levels = support_resistance(df)
    ma20, ma50 = sma(close, 20), sma(close, 50)
    return {
        **levels,
        "as_of": pd.Timestamp(df.index[-1]).date().isoformat(),
        "bars": len(df),
        "ma20": ma20,
        "ma50": ma50,
        "rsi14": rsi(close),
        "trend": trend(levels["price"], ma20, ma50),
        "patterns": candle_patterns(df),
    }
