FROM python:3.11-slim

# uv for fast, reproducible installs (pin a specific uv version for production builds)
COPY --from=ghcr.io/astral-sh/uv:latest /uv /uvx /bin/

WORKDIR /app
ENV UV_COMPILE_BYTECODE=1 \
    UV_LINK_MODE=copy \
    PYTHONUNBUFFERED=1 \
    PATH="/app/.venv/bin:$PATH"

# Install dependencies first so this layer is cached when only the code changes
COPY pyproject.toml uv.lock* ./
RUN uv sync --no-dev --no-install-project

COPY . .
RUN uv sync --no-dev

EXPOSE 8010
CMD ["uvicorn", "app.api.main:app", "--host", "0.0.0.0", "--port", "8010"]
