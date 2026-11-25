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

## Review
