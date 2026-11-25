# HEM-001: FastAPI API skeleton

**Phase:** 0 · **Status:** Todo · **Owner:** Engineer · **Depends on:** -

## Goal
Create `api/` as a uv-managed Python 3.11 project (package `hemfin` under `api/src/hemfin`).

## Acceptance criteria
- [ ] `pyproject.toml` with fastapi, uvicorn[standard], pydantic-settings, sqlalchemy[asyncio]>=2, asyncpg, alembic, structlog (or stdlib JSON logging), httpx; dev: pytest, pytest-asyncio, ruff, mypy. `uv.lock` committed.
- [ ] `core/config.py`: pydantic-settings `Settings` (APP_ENV, DATABASE_URL, CORS_ORIGINS, LOG_LEVEL, SUPABASE_URL, SUPABASE_JWT_AUDIENCE placeholders) loaded from env/.env; `api/.env.example`.
- [ ] `core/logging.py` structured JSON logs with request id middleware.
- [ ] `core/errors.py` RFC 7807 problem+json handlers for HTTPException, validation errors, and unhandled errors (no stack traces leaked).
- [ ] `core/db.py` async engine + session dependency; asyncpg configured to work through the Supabase pooler (`statement_cache_size=0`).
- [ ] `main.py` app factory: `/api/v1` router, CORS, `GET /health` (liveness) and `GET /health/ready` (checks DB, 503 if down). OpenAPI title "HemFin API".
- [ ] Alembic configured (async), baseline migration creates schema `app`; `version_table_schema='app'`.
- [ ] `scripts/export_openapi.py` writes `api/openapi.json` (committed) without needing a DB.
- [ ] pytest: health returns 200, problem+json shape for 404 and validation error. Tests must not require a DB except ones marked `@pytest.mark.db` (skipped when DATABASE_URL unset).
- [ ] ruff (lint+format) and mypy (strict on src) pass.
- [ ] `api/Dockerfile` (python:3.11-slim, uv, non-root, `uvicorn hemfin.main:app --host 0.0.0.0 --port $PORT`) builds; runs `alembic upgrade head` on start via an entry script.

## Design notes

## Handoff log

## Review
