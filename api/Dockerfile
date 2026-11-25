FROM python:3.11-slim

COPY --from=ghcr.io/astral-sh/uv:0.13 /uv /usr/local/bin/uv

ENV UV_COMPILE_BYTECODE=1 UV_LINK_MODE=copy PYTHONUNBUFFERED=1 PATH="/app/.venv/bin:$PATH"
WORKDIR /app

COPY pyproject.toml uv.lock ./
RUN uv sync --frozen --no-dev --no-install-project

COPY src ./src
COPY alembic.ini docker-entrypoint.sh ./
COPY alembic ./alembic
RUN uv sync --frozen --no-dev \
    && chmod +x docker-entrypoint.sh \
    && useradd --system --uid 10001 hemfin \
    && chown -R hemfin /app

USER hemfin
ENV PORT=8000
EXPOSE 8000
CMD ["./docker-entrypoint.sh"]
