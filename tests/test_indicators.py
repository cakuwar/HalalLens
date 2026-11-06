import json

import pandas as pd

from app.tools.indicators import (
    candle_patterns,
    compute_indicators,
    rsi,
    sma,
    support_resistance,
    trend,
)


def test_support_resistance_brackets_price(price_df):
    levels = support_resistance(price_df)
    assert levels["supports"], "fixture should contain swing lows below the last close"
    assert all(s < levels["price"] for s in levels["supports"])
    assert all(r > levels["price"] for r in levels["resistances"])
    assert levels["supports"] == sorted(levels["supports"], reverse=True)  # nearest first
    assert len(levels["supports"]) <= 3 and len(levels["resistances"]) <= 3


def test_sma():
    assert sma(pd.Series(range(1, 21), dtype=float), 20) == 10.5
    assert sma(pd.Series([1.0, 2.0]), 20) is None


def test_rsi_bounds_and_extremes(price_df):
    assert 0 <= rsi(price_df["Close"]) <= 100
    assert rsi(pd.Series(range(1, 40), dtype=float)) == 100.0  # only gains
    assert rsi(pd.Series(range(40, 1, -1), dtype=float)) == 0.0  # only losses
    assert rsi(pd.Series([1.0] * 5)) is None  # not enough bars


def test_trend():
    assert trend(5.0, 4.8, 4.5) == "uptrend"
    assert trend(4.0, 4.2, 4.5) == "downtrend"
    assert trend(4.6, 4.8, 4.5) == "sideways"
    assert trend(4.6, None, 4.5) == "insufficient data"


def test_bullish_engulfing():
    df = pd.DataFrame(
        {"Open": [5.0, 4.7], "High": [5.05, 5.2], "Low": [4.75, 4.65], "Close": [4.8, 5.1]},
        index=pd.to_datetime(["2026-03-02", "2026-03-03"]),
    )
    patterns = [p["pattern"] for p in candle_patterns(df)]
    assert "bullish engulfing" in patterns


def test_compute_indicators_is_json_serialisable(price_df):
    facts = compute_indicators(price_df)
    json.dumps(facts)  # must not raise: goes straight into the LLM prompt and the state
    assert facts["as_of"] == "2026-06-18"
    assert facts["bars"] == 120
    assert {"price", "supports", "resistances", "ma20", "ma50", "rsi14", "trend", "patterns"} <= facts.keys()
