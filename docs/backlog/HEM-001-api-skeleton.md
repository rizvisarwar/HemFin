# HEM-001: FastAPI API skeleton

**Phase:** 0 · **Status:** In Review · **Owner:** Engineer · **Depends on:** -

## Goal
Create `api/` as a uv-managed Python 3.11 project (package `hemfin` under `api/src/hemfin`).

## Acceptance criteria
- [x] `pyproject.toml` with fastapi, uvicorn[standard], pydantic-settings, sqlalchemy[asyncio]>=2, asyncpg, alembic, structlog (or stdlib JSON logging), httpx; dev: pytest, pytest-asyncio, ruff, mypy. `uv.lock` committed.
- [x] `core/config.py`: pydantic-settings `Settings` (APP_ENV, DATABASE_URL, CORS_ORIGINS, LOG_LEVEL, SUPABASE_URL, SUPABASE_JWT_AUDIENCE placeholders) loaded from env/.env; `api/.env.example`.
- [x] `core/logging.py` structured JSON logs with request id middleware.
- [x] `core/errors.py` RFC 7807 problem+json handlers for HTTPException, validation errors, and unhandled errors (no stack traces leaked).
- [x] `core/db.py` async engine + session dependency; asyncpg configured to work through the Supabase pooler (`statement_cache_size=0`).
- [x] `main.py` app factory: `/api/v1` router, CORS, `GET /health` (liveness) and `GET /health/ready` (checks DB, 503 if down). OpenAPI title "HemFin API".
- [x] Alembic configured (async), baseline migration creates schema `app`; `version_table_schema='app'`.
- [x] `scripts/export_openapi.py` writes `api/openapi.json` (committed) without needing a DB.
- [x] pytest: health returns 200, problem+json shape for 404 and validation error. Tests must not require a DB except ones marked `@pytest.mark.db` (skipped when DATABASE_URL unset).
- [x] ruff (lint+format) and mypy (strict on src) pass.
- [ ] `api/Dockerfile` (python:3.11-slim, uv, non-root, `uvicorn hemfin.main:app --host 0.0.0.0 --port $PORT`) builds; runs `alembic upgrade head` on start via an entry script. (written; build verification deferred to CI in HEM-006 per PM)

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

### 2026-11-25 Engineer, review round 1 fixes
1. Baseline downgrade is now a no-op with a comment (no DROP/CASCADE); db test round-trips upgrade, downgrade base, upgrade.
2. Added innermost `UnhandledErrorMiddleware`, so 500s pass through request-id and CORS; test asserts `x-request-id`, `request_id` body field and `access-control-allow-origin`.
3. Docker build deferred to CI in HEM-006 per PM decision; no action now (Dockerfile criterion left unticked).
4. Readiness handler logs a warning with exc_info before returning 503.
5. Added `@pytest.mark.db` `test_migration_roundtrip` (not run locally, no Postgres).
6. Client `X-Request-ID` accepted only if it matches `^[A-Za-z0-9._-]{1,64}$`, else generated; test added.
7. Status set to In Review, met acceptance criteria ticked.

### 2026-11-25 Engineer, secrets requirement (CLAUDE.md rule 7)
- `Settings` source order is env > secret files in `SECRETS_DIR` (default `/etc/secrets`, skipped if missing) > `.env`. `DATABASE_URL` is `SecretStr | None`; asyncpg rewrite happens in a before-validator that handles SecretStr. `get_engine()`, `/health/ready` (503) and Alembic use `require_database_url()`, which raises `MissingSecretError` naming the variable only. Settings are never logged.
- `.env.example` has placeholders and production source comments. Tests cover secrets_dir file, env override, missing dir, masking in repr/str, missing-variable error. `export_openapi.py` needs no DB env.

### 2026-11-25 Engineer, review round 2 fixes
- A: `db.parse_database_url`/`build_engine` replace any parser or engine error with fixed-text `InvalidSecretError` raised outside the except block (no cause/context). Used by `get_engine()` and `alembic/env.py`. Test checks the response, captured logs and exception cause/context for the marker.
- B: lifespan calls `require_database_url()` and validates the URL unless `APP_ENV == "test"`; conftest sets `APP_ENV=test`. Tests: startup fails without DATABASE_URL (names variable) and with a malformed URL. `export_openapi.py` does not run the lifespan and still works with no DB env.
- C: `SECRETS_DIR=` removed from `.env.example`, replaced by a comment that it must be a real env var.
- D, E: no action. db-marked tests run in CI (HEM-006), not a merge blocker.

## Review

### Round 1 (2026-11-25)

**CHANGES_REQUESTED**

Checks run on PR #1 (branch `hem-001-api-skeleton`, commit 1825820): `uv sync` pass, `ruff check` pass, `ruff format --check` pass (12 files), `mypy src` pass (8 files), `pytest -q` 8 passed / 2 skipped (db tests, no DATABASE_URL). Not run: Docker build (daemon unavailable), db-marked tests (no Postgres).

Findings:

1. **blocking**: `api/alembic/versions/20261125_0001_create_app_schema.py:20-21`. The downgrade runs `DROP SCHEMA IF EXISTS app CASCADE`, which also drops `app.alembic_version`. Alembic then runs `DELETE FROM app.alembic_version WHERE version_num='0001'` in the same transaction (`alembic/runtime/migration.py`, `run_migrations` → `HeadMaintainer.update_to_step` → `_delete_version`). That DELETE fails, so `alembic downgrade base` errors and rolls back. Not run live (no Postgres), but this follows from the Alembic source. Confirm with `upgrade head` then `downgrade base` on a real DB. Fix: make the downgrade not drop the schema that holds the version table (a no-op with a comment is enough for a baseline). `CASCADE` should also go, since later migrations will add tables.

2. **blocking**: unhandled errors lose the request id and CORS headers. Verified with a temporary probe (`TestClient(raise_server_exceptions=False)`, route raising `RuntimeError`, `Origin: http://localhost:3000`). The 500 response has only `content-type: application/problem+json` and `content-length`. It has no `X-Request-ID` header, no `request_id` in the body, and no `access-control-*` headers. The unhandled-exception log line has `request_id: null`. Cause: Starlette runs `Exception` handlers in `ServerErrorMiddleware`, which sits outside `RequestIdMiddleware` and `CORSMiddleware`, so their header and contextvar handling never sees the response. The no-leak part passes (no stack trace or exception text in the body). Fix: catch unhandled exceptions inside the middleware stack so the 500 passes back through the request-id and CORS middleware, and add a test asserting `x-request-id` and an allowed-origin `access-control-allow-origin` on the 500 response. Keep the existing no-leak assertions.

3. **blocking (verification)**: the Dockerfile acceptance criterion ("builds") is unmet. The PR body leaves it unchecked. Review by reading passes: non-root `USER hemfin` (`api/Dockerfile:16-19`), `--port "${PORT:-8000}"` (`api/docker-entrypoint.sh:4`), `alembic upgrade head` before start, `.dockerignore` excludes `.env` and `tests`, and the shell script has LF endings. Needs `docker build` plus a run against a DB before approval. This is not a code defect.

4. **nit**: `api/src/hemfin/main.py:51-52`. The readiness handler swallows the exception with no log, so a 503 can't be diagnosed from logs. Add `log.warning("database readiness check failed", exc_info=True)`.

5. **nit**: `api/tests/test_api.py:80-87`. The db-marked tests don't exercise the migration. Once finding 1 is fixed, add a db test that round-trips `upgrade head` and `downgrade base`.

6. **nit**: `api/src/hemfin/core/logging.py:56-57`. The client-supplied `X-Request-ID` is accepted verbatim (truncated to 128). Consider restricting it to a safe character set, such as `[A-Za-z0-9._-]`.

7. **nit**: ticket housekeeping. Status is still `Todo`, the Handoff log is empty, `docs/backlog/board.md` is unchanged, and the ticket's acceptance checkboxes are unchecked while the PR body checks them.

Checklist passes:
- Problem+json on 404, 422, 500 and 503. Error bodies contain no traceback or internal text.
- Secrets: `.env` is gitignored (`.gitignore:153`). Only `api/.env.example` is tracked. Its `postgres:postgres` value is a local placeholder.
- Async DB: `statement_cache_size=0` and `prepared_statement_cache_size=0` are both applied. Checked against the SQLAlchemy asyncpg dialect source. `pool_pre_ping=True`.
- Alembic async env creates schema `app` before the version table (`alembic/env.py:36`), with `version_table_schema='app'`.
- `api/openapi.json` matches the generated spec (ignoring CR).
- Health endpoints sit outside `/api/v1` as the ticket specifies. The `/api/v1` router is mounted empty.

Verdict: CHANGES_REQUESTED on findings 1 and 2. Finding 3 must be closed before approval. Findings 4 to 7 are optional.

### Round 2 (2026-11-25)

**CHANGES_REQUESTED**

Checks run on PR #1 (branch `hem-001-api-skeleton`, commit 83d288c): `uv sync` pass, `ruff check` pass, `ruff format --check` pass (12 files), `mypy src` pass (8 files), `pytest -q -rs` 15 passed / 3 skipped (db-marked: `test_ready_ok_with_db`, `test_app_schema_exists`, `test_migration_roundtrip`; no DATABASE_URL). Not run: db-marked tests (no Postgres), Docker build (deferred to HEM-006 per PM).

Round 1 status:
- 1 (downgrade drops schema): fixed. Baseline downgrade is a no-op (`api/alembic/versions/20261125_0001_create_app_schema.py:20-23`). The db round-trip test is added but not run here.
- 2 (500 lacks request id and CORS): fixed. `UnhandledErrorMiddleware` is innermost. `test_500_has_request_id_and_cors` passes.
- 3 (Docker build): deferred to HEM-006 by PM decision. Not blocking.
- 4 (readiness not logged): fixed (`main.py:63`). See new finding A, since this log line is now the leak path.
- 5 (no migration test): added (`test_api.py:146-155`), not run here.
- 6 (request id charset): fixed. `logging.py:14`, tested.
- 7 (housekeeping): fixed for the ticket (status In Review, Handoff log filled). `docs/backlog/board.md` is still unchanged, so this is partly open. Nit.

Rule 7 (secrets) review:
- Source order is correct: env, then SECRETS_DIR files, then `.env` (`config.py:49`). Covered by `test_env_overrides_secrets_dir`.
- `DATABASE_URL` is `SecretStr`. It is the only secret field. `repr`/`str` mask it (`test_secret_masked_in_repr_and_str`).
- Problem+json bodies: no settings or secret values. Probed.
- `api/.env.example`: placeholders only.
- The missing-secret error names the variable and not its value (`config.py:72-75`).
- `.env` is gitignored (`.gitignore:153`).

Findings:

A. **blocking**: a secret value reaches the logs. Rule 7: never log secret values. Probe: `DATABASE_URL=postgresql+asyncpg://u:<marker>` (no `@host`), then `GET /health/ready`. The response is 503 and the body does not contain the marker. The marker appears once in the JSON log output. Cause: `make_url` raises a `ValueError` that echoes the full URL, and `db.get_engine()` (`api/src/hemfin/core/db.py:31-36`) lets it through. `ready()` then logs it with `exc_info=True` (`main.py:63`). The same path applies to any unhandled exception from `get_engine`, and to `alembic/env.py:46` where the traceback is printed. Fix: in `get_engine` (and the Alembic `run_migrations_online` engine), wrap `create_async_engine` and raise a fixed-text error with `from None`, e.g. `MissingSecretError("DATABASE_URL is not a valid SQLAlchemy URL.")`. Add a test that sets a malformed `DATABASE_URL` containing a marker, calls `/health/ready`, and asserts the marker is absent from captured output.

B. **blocking**: a missing required secret does not stop the app at startup. Rule 7: a missing required secret must stop the app at startup with an error naming the variable. `create_app()` and `uvicorn hemfin.main:app` start with `DATABASE_URL` unset, and the suite runs that way. The Docker entrypoint still fails because `alembic upgrade head` runs first, but the app process itself does not. Fix: call `require_database_url()` in the lifespan startup, and skip it only when `APP_ENV == "test"`. Have `conftest.py` set `APP_ENV=test` (a non-secret). If the PM decides DATABASE_URL should stay optional for local non-DB work, that needs an explicit exception to rule 7 in CLAUDE.md, not a silent one.

C. **nit**: `api/src/hemfin/core/config.py:81`. `load_settings` reads `SECRETS_DIR` from `os.environ` only. A `SECRETS_DIR=` line in `api/.env`, which `.env.example` suggests, is silently ignored. Either declare `SECRETS_DIR` as a `Settings` field or document that it must be an env var.

D. **nit**: the local default `postgres:postgres` is still in commit 1825820 history, although it is removed from the tree in 83d288c. It is a throwaway local password, not a live credential, so no rotation is needed. Note it for the record. Rule 7 forbids defaults for secrets.

E. **nit**: `docs/backlog/board.md` still does not show HEM-001 as In Review (see Round 1 finding 7).

Verdict: CHANGES_REQUESTED on A and B. C, D and E are optional. Once A and B are fixed, the Round 2 checks should be rerun with a real Postgres (`@pytest.mark.db` tests and the migration round-trip) before approval.
