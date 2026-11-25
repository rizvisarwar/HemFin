# HEM-005: Local dev orchestration (Aspire, Supabase CLI, docker-compose)

**Phase:** 0 · **Status:** In Review · **Owner:** Engineer · **Depends on:** HEM-001, HEM-003

## Goal
One-command local stack.

## Acceptance criteria
- [ ] `supabase/` initialised (`npx supabase init`), config sets site_url http://localhost:3000, Google provider stubbed (disabled, env-driven), and the `app` schema NOT added to exposed API schemas.
- [ ] `aspire/HemFin.AppHost` (Aspire 13, net10.0): api via Python hosting (`AddUvicornApp` or equivalent) and web via JavaScript hosting, env wired (DATABASE_URL to local Supabase Postgres 127.0.0.1:54322, NEXT_PUBLIC_API_URL to the api endpoint), OTEL to dashboard. Add OpenTelemetry instrumentation to the API (optional, env-enabled).
- [ ] `docker-compose.yml` alternative: postgres:16 + api + web for those without Supabase CLI/Aspire.
- [ ] Root `README.md`: prerequisites, quick start for both paths, env files, common commands.
- [ ] `dotnet build` of the AppHost succeeds. (Docker may not be running on the build machine; document manual verification steps if it cannot be run.)

## Design notes

## Handoff log

### 2026-11-25 Engineer
**Done**
- `supabase/` via `npx supabase init` (CLI 3.4.0 writes `config.jsonc`, not `config.toml`). `project_id=hemfin`, `site_url=http://localhost:3000`, Google provider stubbed and disabled with `env(...)` client id/secret, `api.schemas` left at `public, graphql_public` (no `app`). `supabase/.env.example` added; `supabase/.env` gitignored.
- `aspire/HemFin.AppHost` (Aspire.AppHost.Sdk 13.1.3, net10.0): `AddUvicornApp("api", "../../api", "hemfin.main:app")` and `AddJavaScriptApp("web", "../../web", "dev")` on fixed port 3000. `NEXT_PUBLIC_API_URL` is the api endpoint, `CORS_ORIGINS` is localhost:3000. `DATABASE_URL` is a secret AppHost parameter (`Parameters:database-url`, set via `dotnet user-secrets`), so no credential is committed. `aspire new` templates failed in this environment, so the project was written by hand.
- API OpenTelemetry (`hemfin/core/telemetry.py`), enabled only when `OTEL_EXPORTER_OTLP_ENDPOINT` is set; lazy imports so nothing changes when unset. Tests cover off, blank and on (with in-memory exporters).
- `docker-compose.yml` (postgres:16, api via `api/Dockerfile`, web as `node:22` dev server with `web/` mounted since web has no Dockerfile). `POSTGRES_PASSWORD` is required with no default; root `.env.example` added.
- Root `README.md` with prerequisites, both quick starts, env file table, commands and a manual verification checklist.

**Verified (no Docker)**: `dotnet build aspire/HemFin.AppHost` succeeds; `POSTGRES_PASSWORD=x docker compose config` succeeds (and fails with a clear message when unset); API ruff, format, mypy, pytest pass.

**Not verified (needs Docker daemon)**: `aspire run`, `npx supabase start`, `docker compose up`. See the checklist at the end of the root README.

**Limitations and follow-ups**
- Aspire does not run Alembic; run `uv run alembic upgrade head` once (README). Could be an AppHost step later.
- Whether `AddUvicornApp` picks `uv` automatically and whether `AddJavaScriptApp` runs `npm install` first is unconfirmed; README tells the user to run `npm install` in `web/`.
- HEM-004 (npm workspaces) may change how `web` installs; the compose `web` service runs `npm ci` inside `web/` and may need adjusting after it merges. A `web/Dockerfile` (HEM-006 or later) would replace that.
- OTLP exporter is gRPC; if Aspire injects `http/protobuf` the standard `OTEL_EXPORTER_OTLP_PROTOCOL` should be honoured by the gRPC exporter only for grpc, so confirm during manual step 3 and add the http exporter package if traces are missing.

### 2026-11-25 Engineer: Round 1 fixes
1. Compose api and web ports now publish on `127.0.0.1` only; `--hostname 0.0.0.0` inside the container is unchanged.
2. `telemetry.py` picks the exporter from `OTEL_EXPORTER_OTLP_PROTOCOL` (`grpc` default, `http/protobuf`); other values log a warning and leave telemetry off. Added `opentelemetry-exporter-otlp-proto-http`; imports stay lazy. Tests cover default, grpc and http/protobuf plus an unsupported value. README states exactly this. Still confirm with Aspire in manual step 3.
3. AppHost comment now says Aspire is "expected to inject" the OTEL_* variables (verify in manual step 3).
4. Removed `WithExternalHttpEndpoints()` from both resources.
5. Replaced the deprecated SDK `LoggingHandler` with `opentelemetry.instrumentation.logging.handler.LoggingHandler` (added `opentelemetry-instrumentation-logging`). The OTel deprecation warnings are gone from pytest.
6. Follow-up for the invitations ticket: keep tokens out of URLs (path or body, not query string), or strip query strings from spans. FastAPI instrumentation records full URLs. Noted in `telemetry.py` and the README; no code change now (PM decision).
7. Test comment added explaining that OTel global providers are once-per-process and the test asserts exporter selection only.
8. OTel packages stay regular dependencies (PM decision) to keep the Docker image and Render simple.
9. `npm ci` on each compose web start accepted (dev only).

## Review

### Round 1 (2026-11-25) Reviewer: CHANGES_REQUESTED

**Checks run (PR #4, branch `hem-005-local-dev` at 225124b)**
- `dotnet build aspire/HemFin.AppHost`: pass (0 warnings, 0 errors).
- `POSTGRES_PASSWORD=x docker compose config`: pass. Without the variable it fails with "Set POSTGRES_PASSWORD in .env". The required-variable check works.
- `api/`: `uv sync`, `ruff check`, `ruff format --check` (14 files), `mypy src` (9 files): all pass. `pytest`: 21 passed, 3 skipped. The 3 skips are DB tests with `DATABASE_URL` unset (`api/tests/test_api.py:131,138,148`).
- Secrets: no literal credentials in the diff. The only DB URL is the compose template, which uses `${POSTGRES_PASSWORD:?...}`. `.env`, `supabase/.env` and `api/.env` are gitignored. `config.jsonc` uses `env(...)` for every secret. The DATABASE_URL user-secret parameter approach is correct.
- `app` schema: `api.schemas` is `["public", "graphql_public"]`, so `app` is not exposed. Passes.
- Google provider: disabled, client id and secret from `env(...)`. `site_url` is `http://localhost:3000`. Passes.
- OTel opt-in: `setup_telemetry` returns before importing OTel packages when `OTEL_EXPORTER_OTLP_ENDPOINT` is unset or blank. Passes. The remaining issues are the nits below.
- Wiring: `/health` (AppHost health check) and `/health/ready` (README) both exist. `CORS_ORIGINS` parses comma-separated. `postgresql://` is rewritten to asyncpg. `hemfin.main:app` exists. The Dockerfile entrypoint runs `alembic upgrade head`, as the README says. Passes.
- Not runnable here (no Docker daemon; accepted as manual steps): `aspire run`, `npx supabase start`, `docker compose up`.

**Findings**

1. **blocking**: `docker-compose.yml:41` and `docker-compose.yml:64`. The `api` and `web` ports are published as `"8000:8000"` and `"3000:3000"`, which bind all host interfaces. Only `db` (line 17) is loopback-only. The API has no auth yet, so a dev laptop would expose it on the LAN. Fix: `"127.0.0.1:8000:8000"` and `"127.0.0.1:3000:3000"`. The in-container `--hostname 0.0.0.0` at line 62 stays.

2. **blocking**: `README.md:72` says the standard `OTEL_EXPORTER_OTLP_PROTOCOL` applies. It does not. `api/src/hemfin/core/telemetry.py:28-30` hard-codes the gRPC exporter classes, and they ignore that variable. If Aspire injects `http/protobuf` for the Python API, spans and logs will not reach the dashboard, and the "OTEL to dashboard" acceptance criterion fails. The handoff log already flags this as unconfirmed. Fix: either choose the exporter from `OTEL_EXPORTER_OTLP_PROTOCOL` (adding the http exporter package), or remove the claim from the README and state gRPC only. Confirm during manual step 3.

3. **nit**: `aspire/HemFin.AppHost/AppHost.cs:10-11` says Aspire injects the `OTEL_*` variables for the API. This is unverified, since no `WithOtlpExporter` call is present. Reword as "expected to" until manual step 3 confirms it.

4. **nit**: `aspire/HemFin.AppHost/AppHost.cs:17` and `:25`. `WithExternalHttpEndpoints()` is a publish-time concept and is not needed for local runs. Remove it, or justify it in a comment.

5. **nit**: `api/src/hemfin/core/telemetry.py:32` and `:55`. `LoggingHandler` is deprecated, and pytest shows the warning. Use the handler from `opentelemetry-instrumentation-logging`, as the warning suggests.

6. **nit**: `api/src/hemfin/core/telemetry.py:57`. FastAPI instrumentation records the full URL, including the query string, in span attributes. No secret is in a query string today. Invitation tokens, if they are ever sent as query parameters, would leak into traces. Note this as a follow-up for the invitations ticket, or add a URL sanitizer.

7. **nit**: `api/tests/test_telemetry.py:28-42`. OTel `set_tracer_provider`, `set_meter_provider` and `set_logger_provider` are once-per-process. The test leaves the global providers set for the rest of the run and only restores the root logger handlers. Consider a subprocess test, or accept it with a comment.

8. **nit**: `api/pyproject.toml:14-16`. The OTel packages are hard dependencies, but the ticket says OTel is optional and env-enabled. The code path is opt-in either way. An `otel` optional extra would keep the default install and image lean, if wanted.

9. **nit**: `docker-compose.yml:62`. `npm ci` runs on every container start. It is slow but correct. A named volume plus a lockfile hash check would cut the wait.

**Acceptance criteria**
- supabase init and config: met.
- AppHost (api via `AddUvicornApp`, web via `AddJavaScriptApp`, env wiring): met in code. Runtime unverified (no Docker).
- OTel to dashboard: unverified. See finding 2.
- docker-compose: met (config validates). Runtime unverified (no Docker). See finding 1 for ports.
- Root README: accurate except for the OTel protocol claim (finding 2).
- `dotnet build` succeeds: met.

**Verdict: CHANGES_REQUESTED.** Blocking: findings 1 and 2.
