"""Run the graph on the eval dataset, score every case, and record the experiment.

    uv run python evals/run_experiment.py --name v0.1-baseline
    uv run python evals/run_experiment.py --name smoke --limit 10 --no-judges   # CI smoke test
    uv run python evals/run_experiment.py --upload-dataset                       # push dataset to Langfuse

Results go to evals/results/<name>.json. Copy the printed summary row into the README table.
"""

import argparse
import json
import statistics
import sys
import time
import uuid
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT))  # lets `python evals/run_experiment.py` import app/ and evals/

from langgraph.checkpoint.memory import InMemorySaver  # noqa: E402

from app.config import run_config, settings  # noqa: E402
from app.graph.graph import build_graph  # noqa: E402
from evals.evaluators import CODE_EVALUATORS, JUDGE_EVALUATORS  # noqa: E402

DATASET_PATH = ROOT / "evals" / "dataset.jsonl"
RESULTS_DIR = ROOT / "evals" / "results"
DATASET_NAME = "halallens-eval"


def load_dataset(limit: int | None = None) -> list[dict]:
    lines = DATASET_PATH.read_text(encoding="utf-8").splitlines()
    items = [json.loads(line) for line in lines if line.strip()]
    return items[:limit] if limit else items


def run_case(graph, item: dict, name: str) -> tuple[dict, float, str | None]:
    """Run one case until the human_review interrupt. The draft is what gets scored."""
    thread_id = f"eval-{name}-{item['id']}-{uuid.uuid4().hex[:6]}"
    config = run_config(thread_id, user_id="eval", tags=["eval", name, item.get("case_type", "")])
    start = time.perf_counter()
    try:
        state = graph.invoke({"query": item["input"], "feedback": None, "revision": 0}, config)
        error = None
    except Exception as exc:
        state, error = {}, repr(exc)
    return state, time.perf_counter() - start, error


def score_case(state: dict, expected: dict, use_judges: bool) -> dict[str, float | None]:
    evaluators = {**CODE_EVALUATORS, **(JUDGE_EVALUATORS if use_judges else {})}
    scores = {}
    for metric, fn in evaluators.items():
        try:
            scores[metric] = fn(state, expected)
        except Exception as exc:
            print(f"    {metric} failed: {exc!r}")
            scores[metric] = None
    return scores


def upload_dataset() -> None:
    """Push dataset.jsonl to Langfuse. Check these calls against your Langfuse SDK version."""
    from langfuse import get_client

    langfuse = get_client()
    langfuse.create_dataset(name=DATASET_NAME)
    for item in load_dataset():
        langfuse.create_dataset_item(
            dataset_name=DATASET_NAME,
            id=item["id"],  # stable id, so re-uploading updates instead of duplicating
            input={"query": item["input"]},
            expected_output=item["expected"],
            metadata={"case_type": item.get("case_type")},
        )
    langfuse.flush()
    print(f"Uploaded {len(load_dataset())} items to Langfuse dataset '{DATASET_NAME}'")


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--name", default=f"{settings.app_version}-run")
    parser.add_argument("--limit", type=int, help="Only the first N items (CI smoke test)")
    parser.add_argument("--no-judges", action="store_true", help="Skip LLM-as-judge evaluators")
    parser.add_argument("--upload-dataset", action="store_true")
    args = parser.parse_args()

    if args.upload_dataset:
        upload_dataset()
        return

    # TODO(week 5): run through the Langfuse dataset (dataset run per experiment) so runs can be
    # compared side by side in the Langfuse UI, and push each score to its trace. Pull cost_usd per
    # trace from Langfuse too. See the Langfuse "Datasets" and "Experiments" docs.
    graph = build_graph(InMemorySaver())
    items = load_dataset(args.limit)
    results = []
    for item in items:
        print(f"- {item['id']}: {item['input']}")
        state, latency, error = run_case(graph, item, args.name)
        scores = score_case(state, item["expected"], use_judges=not args.no_judges)
        print(f"    {scores}  ({latency:.1f}s){'  ERROR ' + error if error else ''}")
        results.append(
            {
                "id": item["id"],
                "case_type": item.get("case_type"),
                "tickers": state.get("tickers"),
                "draft": state.get("draft"),
                "scores": scores,
                "latency_s": round(latency, 2),
                "error": error,
            }
        )

    summary = {
        metric: _mean([r["scores"].get(metric) for r in results])
        for metric in [*CODE_EVALUATORS, *([] if args.no_judges else JUDGE_EVALUATORS)]
    }
    summary["median_latency_s"] = round(statistics.median(r["latency_s"] for r in results), 1)

    RESULTS_DIR.mkdir(exist_ok=True)
    out = RESULTS_DIR / f"{args.name}.json"
    out.write_text(json.dumps({"name": args.name, "summary": summary, "results": results}, indent=2))

    print(f"\nSummary ({len(results)} cases) -> {out}")
    print("| " + " | ".join(["version", *summary]) + " |")
    print("| " + " | ".join([args.name, *(_fmt(v) for v in summary.values())]) + " |")


def _mean(values: list[float | None]) -> float | None:
    present = [v for v in values if v is not None]
    return round(statistics.mean(present), 3) if present else None


def _fmt(value: float | None) -> str:
    return "n/a" if value is None else str(value)


if __name__ == "__main__":
    main()
