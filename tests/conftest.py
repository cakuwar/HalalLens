from pathlib import Path

import pandas as pd
import pytest

FIXTURES = Path(__file__).parent / "fixtures"


@pytest.fixture
def price_df() -> pd.DataFrame:
    """120 business days of synthetic OHLCV (fixed, no network)."""
    return pd.read_csv(FIXTURES / "prices_sample.csv", index_col="Date", parse_dates=True)


@pytest.fixture
def shariah_csv() -> Path:
    """Synthetic SC list with made-up companies (codes 9001-9003)."""
    return FIXTURES / "shariah_list_sample.csv"
