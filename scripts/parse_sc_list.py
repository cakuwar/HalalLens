"""Turn the SC Malaysia "List of Shariah-compliant Securities" PDF into data/shariah_list.csv.

Run from the project root (the folder with pyproject.toml) with your venv active:

    python scripts/parse_sc_list.py data/raw/<sc_list>.pdf
    python scripts/parse_sc_list.py data/raw/<sc_list>.pdf --dump-page 21   # see how a page is read

The list date is read from the PDF ("takes effect from 28 November 2025").
Pass --list-date YYYY-MM-DD to override it.

Layout handled (checked against the 28 Nov 2025 list):
- Two text columns per page. Each page is split at the right column's left edge
  and each column is read top to bottom.
- "No. Code Name" rows whose company names wrap onto the next line.
- Sector headings in English then Malay, some printed with doubled characters.
- 4-digit codes (Main and ACE markets) and 5-digit codes (LEAP market).
- Table 1 (newly compliant) and Table 2 (newly non-compliant) before the full list.

Output: every security in the full list as "Compliant", plus the Table 2
securities as "Non-compliant" so the ticker resolver can still find them. The
script refuses to write the CSV if its count differs from the total in Table 3,
or if a Table 2 security also appears in the compliant list.
"""

import argparse
import csv
import re
import sys
from dataclasses import dataclass, field
from datetime import date, datetime
from pathlib import Path

import pdfplumber

ROOT = Path(__file__).resolve().parent.parent
DEFAULT_OUT = ROOT / "data" / "shariah_list.csv"
FIELDS = ["code", "name", "sector", "status", "list_date", "market"]

# "12. 7579 AWC Bhd". The dot is optional: the Nov 2025 list prints "172 7227 UMS-Neiken Group Bhd".
ENTRY_RE = re.compile(r"^(\d{1,4})\.?\s+(\d{4,5})\b\s*(.*)$")
COLUMN_HEADER_RE = re.compile(r"^(No\.|Bil\.)|^code(\s+code)?$")
ENTRY_NUMBER_RE = re.compile(r"\d{1,4}\.")

# English sector names as printed in Table 3. Headings are matched with spaces and
# punctuation removed, so "HEALTH CARE" matches "Healthcare".
SECTORS = [
    "Industrial products and services",
    "Consumer products and services",
    "Telecommunications and media",
    "Transportation and logistics",
    "Financial services",
    "Closed-end fund",
    "Construction",
    "Technology",
    "Plantation",
    "Healthcare",
    "Utilities",
    "Property",
    "Energy",
]
MARKETS = {"MAINMARKET": "Main", "ACEMARKET": "ACE", "LEAPMARKET": "LEAP"}


@dataclass
class ReadState:
    sector: str = ""
    market: str = ""
    heading: list[str] = field(default_factory=list)  # heading lines not yet applied


def _key(text: str) -> str:
    return re.sub(r"[^A-Z]", "", text.upper())


def apply_heading(state: ReadState) -> None:
    """Update the current market and sector from the heading lines read so far."""
    key = _key(" ".join(state.heading))
    state.heading.clear()
    for marker, market in MARKETS.items():
        if marker in key:
            state.market = market
    for sector in SECTORS:  # longest names first
        if _key(sector) in key:
            state.sector = sector
            break


def is_heading(line: str) -> bool:
    letters = [c for c in line if c.isalpha()]
    return len(letters) >= 4 and line == line.upper()


def page_mode(text: str, current: str | None) -> str | None:
    """Which part of the booklet a page belongs to."""
    if "ADDITIONAL LIST" in text:  # other instruments, e.g. Islamic business trusts
        return "additional"
    if "Table 1:" in text:
        return "added"
    if "Table 2:" in text:
        return "removed"
    if re.search(r"^Table 3\b", text, flags=re.MULTILINE):
        return None
    if "LIST OF SHARIAH-COMPLIANT SECURITIES" in text:
        return "list"
    return current


def column_lines(page, columns: int = 2) -> list[list[str]]:
    """Body text of a page as [left column lines, right column lines] (or one full-width column)."""
    page = page.dedupe_chars()  # some headings are printed twice, slightly offset
    words = page.extract_words()

    header = [w["bottom"] for w in words if w["text"] == "Senarai" and w["top"] < 60]
    top = max(header) + 1 if header else 0
    footnote = [
        w["top"]
        for w in words
        if w["text"].startswith("*") and w["top"] > page.height / 2 and w["x0"] < page.width / 4
    ]
    bottom = min(footnote) - 1 if footnote else page.height
    right_numbers = [
        w["x0"] for w in words if ENTRY_NUMBER_RE.fullmatch(w["text"]) and w["x0"] > page.width * 0.4
    ]
    split = min(right_numbers) - 2 if right_numbers else page.width / 2
    boxes = [(0, page.width)] if columns == 1 else [(0, split), (split, page.width)]

    result = []
    for x0, x1 in boxes:
        text = page.within_bbox((x0, top, x1, bottom)).extract_text() or ""
        result.append([line.strip() for line in text.splitlines() if line.strip()])
    return result


def parse_column(lines: list[str], state: ReadState, out: list[dict]) -> None:
    current: dict | None = None
    for line in lines:
        if m := ENTRY_RE.match(line):
            apply_heading(state)
            current = {
                "code": m.group(2),
                "name": m.group(3).strip(),
                "sector": state.sector,
                "market": state.market,
            }
            out.append(current)
        elif COLUMN_HEADER_RE.match(line):
            continue
        elif is_heading(line):
            state.heading.append(line)  # may continue in the next column, so keep it in state
            current = None
        elif current is not None:  # company name wrapped onto this line
            current["name"] = f"{current['name']} {line}".strip()


def parse_additional(lines: list[str], out: list[dict]) -> None:
    """The full-width "Additional list" page. Entries sit under English labels such as
    "Islamic business trust", which become the sector. Names here do not wrap."""
    label = "Other Shariah-compliant instrument"
    for line in lines:
        if m := ENTRY_RE.match(line):
            out.append({"code": m.group(2), "name": m.group(3).strip(), "sector": label, "market": ""})
        elif line.startswith("Islamic "):
            label = line


def parse_pdf(pdf_path: Path) -> dict:
    sections: dict[str, list[dict]] = {"list": [], "additional": [], "added": [], "removed": []}
    texts: list[str] = []
    state = ReadState()
    mode = None
    with pdfplumber.open(pdf_path) as pdf:
        for page in pdf.pages:
            text = page.dedupe_chars().extract_text() or ""
            texts.append(text)
            mode = page_mode(text, mode)
            if mode is None:
                continue
            target = sections[mode]
            before = len(target)
            if mode == "additional":
                parse_additional(column_lines(page, columns=1)[0], target)
            else:
                for lines in column_lines(page):
                    parse_column(lines, state, target)
            if mode == "additional" or (mode == "list" and before and len(target) == before):
                break  # the additional list is the last section; an empty list page also ends it
    return {**sections, "text": "\n".join(texts)}


def detect_list_date(text: str) -> str | None:
    if m := re.search(r"takes\s+effect\s+from\s+(\d{1,2}\s+[A-Z][a-z]+\s+\d{4})", text):
        return datetime.strptime(" ".join(m.group(1).split()), "%d %B %Y").date().isoformat()
    return None


def table3_total(text: str) -> int | None:
    if m := re.search(r"^Total\s+(\d[\d,]*)\s+\d[\d,]*", text, flags=re.MULTILINE):
        return int(m.group(1).replace(",", ""))
    return None


def dump_page(pdf_path: Path, page_number: int) -> None:
    with pdfplumber.open(pdf_path) as pdf:
        page = pdf.pages[page_number - 1]
        full_width = page_mode(page.dedupe_chars().extract_text() or "", None) == "additional"
        names = ["FULL WIDTH"] if full_width else ["LEFT COLUMN", "RIGHT COLUMN"]
        for name, lines in zip(names, column_lines(page, len(names)), strict=True):
            print(f"===== {name} =====")
            print("\n".join(lines))


def main() -> None:
    sys.stdout.reconfigure(errors="replace")  # Windows consoles can't print every character
    parser = argparse.ArgumentParser(
        description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter
    )
    parser.add_argument("pdf", type=Path, help="Path to the SC list PDF")
    parser.add_argument("--list-date", help="Override the effective date, YYYY-MM-DD")
    parser.add_argument("--out", type=Path, default=DEFAULT_OUT)
    parser.add_argument("--dump-page", type=int, help="Print how one page is read, then exit")
    parser.add_argument("--force", action="store_true", help="Write even if the checks fail")
    args = parser.parse_args()

    if not args.pdf.exists():
        sys.exit(f"PDF not found: {args.pdf} (run this from the project root)")
    if args.dump_page:
        dump_page(args.pdf, args.dump_page)
        return

    parsed = parse_pdf(args.pdf)
    listed, additional = parsed["list"], parsed["additional"]
    added, removed = parsed["added"], parsed["removed"]
    compliant = listed + additional

    list_date = args.list_date or detect_list_date(parsed["text"])
    if not list_date:
        sys.exit("Could not find the effective date in the PDF. Pass --list-date YYYY-MM-DD.")
    date.fromisoformat(list_date)

    # --- Checks: Shariah status has zero tolerance for errors --------------------------
    problems = []
    codes = [r["code"] for r in compliant]
    if duplicates := sorted({c for c in codes if codes.count(c) > 1}):
        problems.append(f"Codes listed twice: {duplicates}")
    if clash := sorted(set(codes) & {r["code"] for r in removed}):
        problems.append(f"Table 2 (non-compliant) codes found in the compliant list: {clash}")
    if missing := sorted({r["code"] for r in added} - set(codes)):
        problems.append(f"Table 1 (newly compliant) codes missing from the full list: {missing}")
    total = table3_total(parsed["text"])  # Table 3 counts the main list only
    if total is not None and total != len(listed):
        problems.append(f"Parsed {len(listed)} securities in the full list, Table 3 says {total}")
    if blank := [r["code"] for r in compliant if not r["sector"] or not r["name"]]:
        problems.append(f"Rows missing a sector or name: {blank[:10]}")
    if merged := [r["code"] for r in compliant + removed if re.search(r"\b\d{4,5}\b", r["name"])]:
        problems.append(f"Names containing a stock code (two rows merged?): {merged}")

    print(f"Effective date:            {list_date}")
    print(f"Compliant (full list):     {len(listed)}  (Table 3 total: {total if total else 'n/a'})")
    print(f"Compliant (additional):    {len(additional)}")
    print(f"Newly compliant (Table 1): {len(added)}")
    print(f"Non-compliant (Table 2):   {len(removed)}")
    by_sector: dict[str, int] = {}
    for r in compliant:
        by_sector[r["sector"]] = by_sector.get(r["sector"], 0) + 1
    for sector, count in sorted(by_sector.items(), key=lambda kv: -kv[1]):
        print(f"  {count:>4}  {sector or '(none)'}")

    if problems:
        print("\nCHECKS FAILED:\n- " + "\n- ".join(problems))
        if not args.force:
            sys.exit("Nothing written. Fix the parser (try --dump-page) or rerun with --force.")

    rows = [{**r, "status": "Compliant", "list_date": list_date} for r in compliant]
    rows += [
        {**r, "sector": "", "market": "", "status": "Non-compliant", "list_date": list_date}
        for r in removed
        if r["code"] not in set(codes)
    ]
    args.out.parent.mkdir(parents=True, exist_ok=True)
    with args.out.open("w", newline="", encoding="utf-8") as f:
        writer = csv.DictWriter(f, fieldnames=FIELDS)
        writer.writeheader()
        writer.writerows(sorted(rows, key=lambda r: r["code"]))
    print(f"\nWrote {len(rows)} rows to {args.out}")


if __name__ == "__main__":
    main()
