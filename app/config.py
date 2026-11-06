"""Settings (read from .env), the LLM factory and the Langfuse run config.

Every other module imports `settings` from here instead of reading os.environ.
"""

from pathlib import Path
from typing import Any, Literal

from dotenv import load_dotenv
from pydantic_settings import BaseSettings

ROOT = Path(__file__).resolve().parent.parent

# Load .env into os.environ so third-party clients (Anthropic, Tavily, Langfuse)
# see their API keys too, not just this Settings object.
load_dotenv(ROOT / ".env")

Role = Literal["agent", "writer", "judge"]


class Settings(BaseSettings):
    # --- LLMs: "provider:model" strings for langchain's init_chat_model -------
    # Cheap model for the agents, stronger one for the writer and the eval judge.
    agent_model: str = "anthropic:claude-haiku-5-5"
    writer_model: str = "anthropic:claude-opus-5-5"
    judge_model: str = "anthropic:claude-opus-5-5"
    max_tokens: int = 16000
    # "json_schema" uses the provider's native structured output. Opus 5.5 / Sonnet 5.5
    # reject the forced tool_choice that "function_calling" relies on. Switch only if your
    # langchain-<provider> version does not support json_schema.
    structured_output_method: Literal["json_schema", "function_calling"] = "json_schema"

    # --- External services ----------------------------------------------------
    tavily_api_key: str | None = None
    langfuse_public_key: str | None = None
    langfuse_secret_key: str | None = None
    app_version: str = "v0.1"  # tag on every trace, so experiments can be compared
    langfuse_prompts: bool = False  # week 5: fetch prompts from Langfuse instead of app/prompts/

    # --- Data & persistence -----------------------------------------------------
    shariah_csv: Path = ROOT / "data" / "shariah_list.csv"
    aliases_json: Path = ROOT / "data" / "aliases.json"
    cache_dir: Path = ROOT / ".cache"
    briefs_dir: Path = ROOT / "data" / "briefs"
    sqlite_path: Path = ROOT / "checkpoints.db"
    database_url: str | None = None  # set => PostgresSaver (week 6), unset => SqliteSaver

    # --- Behaviour ----------------------------------------------------------------
    max_revisions: int = 2
    min_match_score: float = 80.0  # rapidfuzz score (0-100) needed to accept a ticker match

    # --- Deployment -----------------------------------------------------------------
    # Comma-separated browser origins allowed to call the API directly, e.g. the Vercel
    # site "https://halallens.vercel.app". Empty = same-origin only (dev proxy / nginx).
    cors_origins: str = ""

    @property
    def cors_origin_list(self) -> list[str]:
        return [o.strip().rstrip("/") for o in self.cors_origins.split(",") if o.strip()]

    @property
    def langfuse_enabled(self) -> bool:
        return bool(self.langfuse_public_key and self.langfuse_secret_key)


settings = Settings()


def get_llm(role: Role):
    """Chat model for a role. Provider is chosen by the model string in .env."""
    from langchain.chat_models import init_chat_model

    model = {
        "agent": settings.agent_model,
        "writer": settings.writer_model,
        "judge": settings.judge_model,
    }[role]
    return init_chat_model(model, max_tokens=settings.max_tokens)


def structured_llm(role: Role, schema: type):
    """Chat model that returns an instance of `schema` (a Pydantic model)."""
    return get_llm(role).with_structured_output(schema, method=settings.structured_output_method)


def run_config(
    thread_id: str, *, user_id: str | None = None, tags: list[str] | None = None
) -> dict[str, Any]:
    """Config for graph.invoke/stream: one thread_id per research session, plus Langfuse tracing."""
    config: dict[str, Any] = {"configurable": {"thread_id": thread_id}}
    if settings.langfuse_enabled:
        from langfuse.langchain import CallbackHandler

        config["callbacks"] = [CallbackHandler()]
        config["metadata"] = {
            "langfuse_session_id": thread_id,
            "langfuse_user_id": user_id or "anonymous",
            "langfuse_tags": [f"version:{settings.app_version}", *(tags or [])],
        }
    return config
