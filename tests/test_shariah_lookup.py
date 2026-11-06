import pytest

from app.tools.shariah_lookup import (
    ShariahListMissing,
    is_ambiguous,
    resolve_ticker,
    shariah_lookup,
)

# --- shariah_lookup (synthetic SC list) --------------------------------------------


def test_listed_stock_is_compliant_with_list_date(shariah_csv):
    record = shariah_lookup("9001", csv_path=shariah_csv)
    assert record.status == "Compliant"
    assert record.list_date == "2026-05-29"
    assert record.sector == "Plantation"
    assert "Securities Commission" in record.source


def test_unlisted_stock_is_non_compliant_and_says_why(shariah_csv):
    record = shariah_lookup("9999", csv_path=shariah_csv)
    assert record.status == "Non-compliant"
    assert "2026-05-29" in record.note


def test_empty_list_raises_instead_of_guessing(tmp_path):
    empty = tmp_path / "empty.csv"
    empty.write_text("code,name,sector,status,list_date\n", encoding="utf-8")
    with pytest.raises(ShariahListMissing):
        shariah_lookup("9001", csv_path=empty)


# --- resolve_ticker (synthetic list + data/aliases.json) -----------------------------


def test_resolves_typo(shariah_csv):
    assert resolve_ticker("maybnk", csv_path=shariah_csv)[0].code == "1155"


def test_resolves_exact_code(shariah_csv):
    assert resolve_ticker("5347", csv_path=shariah_csv)[0].code == "5347"
    assert resolve_ticker("5347.KL", csv_path=shariah_csv)[0].code == "5347"


def test_resolves_name_from_sc_list(shariah_csv):
    assert resolve_ticker("Testco Beta Technology", csv_path=shariah_csv)[0].code == "9002"


def test_ytl_is_ambiguous(shariah_csv):
    matches = resolve_ticker("YTL", csv_path=shariah_csv)
    assert is_ambiguous(matches)
    assert {"4677", "6742"} <= {m.code for m in matches}


def test_non_bursa_company_has_no_match(shariah_csv):
    assert resolve_ticker("Apple", csv_path=shariah_csv) == []
