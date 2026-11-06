"""Prompt loading: Langfuse prompt management first (label="production"), then the local file.

The live versions sit in Langfuse from week 5, and the .md files here are the
fallback copies. Both use {{variable}} placeholders. Pass `prompt.run_config` to
llm.invoke so Langfuse links each generation to the prompt version that produced it.
"""

import logging
from dataclasses import dataclass
from pathlib import Path
from typing import Any

from app.config import settings

log = logging.getLogger(__name__)
PROMPT_DIR = Path(__file__).parent


@dataclass
class Prompt:
    name: str
    text: str
    langfuse_prompt: Any | None = None

    @property
    def run_config(self) -> dict:
        if self.langfuse_prompt is None:
            return {}
        return {"metadata": {"langfuse_prompt": self.langfuse_prompt}}


def get_prompt(name: str, **variables: Any) -> Prompt:
    values = {key: str(value) for key, value in variables.items()}

    if settings.langfuse_enabled and settings.langfuse_prompts:
        try:
            from langfuse import get_client

            lf_prompt = get_client().get_prompt(name, label="production")
            return Prompt(name, lf_prompt.compile(**values), lf_prompt)
        except Exception as exc:  # missing prompt, network error, ...
            log.warning("Langfuse prompt %r unavailable (%s); using local copy", name, exc)

    template = (PROMPT_DIR / f"{name}.md").read_text(encoding="utf-8")
    for key, value in values.items():
        template = template.replace("{{" + key + "}}", value)
    return Prompt(name, template)
