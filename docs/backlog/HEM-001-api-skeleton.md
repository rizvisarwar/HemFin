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

### 2026-11-25 Engineer
- Built `api/` skeleton: `src/hemfin/{main.py, core/{config,logging,errors,db}.py, modules/}`, Alembic (async, baseline `0001` creates schema `app`, `version_table_schema='app'`), `scripts/export_openapi.py` (committed `openapi.json`), tests, Dockerfile and `docker-entrypoint.sh` (LF, enforced by `.gitattributes`).
- Tooling: `uv` was not installed; used `py -m pip install --user uv` and run it as `py -m uv ...` (uv 0.13.10). On a machine with uv on PATH use `uv ...`.
- Verify: `cd api && py -m uv sync && py -m uv run ruff check . && py -m uv run ruff format --check . && py -m uv run mypy src && py -m uv run pytest`. Result: 8 passed, 2 skipped (db-marked, no DATABASE_URL).
- Alembic checked only offline (`alembic upgrade head --sql` shows `CREATE SCHEMA IF NOT EXISTS app` and `app.alembic_version`); no Postgres available locally.
- Not verified: the Dockerfile was NOT built (Docker daemon unavailable). Please build it in CI or locally.
- `/health/ready` and the two `@pytest.mark.db` tests were not run against a real DB.
- Follow-ups: CI workflow to run the checks and Docker build; `render.yaml`; ensure the Supabase pooler URL works with `statement_cache_size=0` against a real instance.

## Review
