# HemFin

Household finance web app. See `docs/PROJECT_PLAN.md` for the plan and `CLAUDE.md` for the engineering rules.

| Folder | What |
|---|---|
| `api/` | FastAPI backend (Python, uv) |
| `web/` | Next.js frontend |
| `supabase/` | Supabase CLI config (local Postgres, Auth) |
| `aspire/HemFin.AppHost/` | .NET Aspire AppHost for local orchestration |
| `docker-compose.yml` | Alternative local stack (postgres + api + web) |

## Prerequisites

Common: Git, Node.js 22+, Python 3.11+ with [uv](https://docs.astral.sh/uv/), Docker (Desktop or Engine) running.

- Path A (Aspire + Supabase CLI): .NET 10 SDK, the Aspire CLI 13.1 (`aspire --version`), and the Supabase CLI (`npx supabase@latest ...` works without installing it).
- Path B (docker compose): Docker only.

## Quick start, path A: Aspire + Supabase CLI

1. Install dependencies once from the repo root (npm workspaces): `npm ci`. Node 22.18+ is required (`.nvmrc`).
2. Start local Supabase (Postgres on `127.0.0.1:54322`, Studio on `:54323`): `npx supabase start`. Run it from the repo root.
3. Give the AppHost the database URL. Copy the "DB URL" from `npx supabase status` and store it as a user secret (kept outside the repo):
   ```
   cd aspire/HemFin.AppHost
   dotnet user-secrets set "Parameters:database-url" "<DB URL from supabase status>"
   ```
4. Run everything: `aspire run` from `aspire/HemFin.AppHost`. The dashboard URL is printed; it shows the `api` and `web` resources, logs, traces and metrics.
   - web: http://localhost:3000
   - api: the endpoint shown in the dashboard (docs at `/docs`)

The AppHost does not run migrations (only the Docker entrypoint does). Apply them once with `cd api && uv run alembic upgrade head` (with `DATABASE_URL` exported or in `api/.env`).

Stop with Ctrl+C in the `aspire run` terminal, then `npx supabase stop`.

The AppHost wires: `DATABASE_URL` (parameter), `NEXT_PUBLIC_API_URL` (the api endpoint), `CORS_ORIGINS=http://localhost:3000`, and the `OTEL_*` variables Aspire injects, which switch on the API's OpenTelemetry (see below).

## Quick start, path B: docker compose

```
cp .env.example .env        # then set POSTGRES_PASSWORD (any value; local throwaway DB)
docker compose up --build
```

- web: http://localhost:3000, api: http://localhost:8000, Postgres: `127.0.0.1:54322`.
- The api container runs `alembic upgrade head` on start, then uvicorn.
- The web service runs the root `npm ci` and then `npm run dev --workspace web` in a Node image with the repo mounted; the first start takes a minute.
- Reset the database: `docker compose down -v`.
- Compose refuses to start with an empty `POSTGRES_PASSWORD`. There is no default.

## Env files

Never commit real values. Each file below is gitignored; its `.example` is committed with placeholders.

| File | Used by | Notes |
|---|---|---|
| `api/.env` (from `api/.env.example`) | API run directly (`uv run uvicorn ...`) | `DATABASE_URL` is a secret. `APP_ENV` defaults to `production`; the example sets `local` (needed for local-only HS256 tokens) |
| `web/.env.local` (from `web/.env.example`) | Next.js run directly | `NEXT_PUBLIC_API_URL`, `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY` (from `npx supabase status`); public values only |
| `.env` (from `.env.example`) | docker compose | `POSTGRES_PASSWORD`, `NEXT_PUBLIC_SUPABASE_*` for the web service, optional `OTEL_EXPORTER_OTLP_ENDPOINT` |
| `supabase/.env` (from `supabase/.env.example`) | Supabase CLI | Only for enabling Google sign-in |
| .NET user secrets | Aspire AppHost | `Parameters:database-url` (secret), `Parameters:supabase-anon-key` (public value) |

Under Aspire you don't need `api/.env` or `web/.env.local`: the AppHost sets those variables, including `SUPABASE_URL` for the API and the two `NEXT_PUBLIC_SUPABASE_*` values for the web. Set the anon key once with `dotnet user-secrets set "Parameters:supabase-anon-key" "<anon key from supabase status>"`. If you run the web by hand against an API, put `NEXT_PUBLIC_API_URL=http://localhost:8000` and the two Supabase values in `web/.env.local`.

### Trying sign-up locally

With `npx supabase start` running, email confirmation is on: sign up at http://localhost:3000/sign-up, then open the local mail catcher at http://127.0.0.1:54324, and click the confirmation link (it returns to `/auth/callback`). The branded email templates are in `supabase/templates/` and are wired in by `supabase/config.jsonc`. Use `localhost` or `127.0.0.1` consistently in the browser, because the session cookie is per host. UNVERIFIED end to end (needs Docker).

### Supabase config

`supabase/config.jsonc` (the current Supabase CLI writes JSONC; older CLIs use `config.toml`) sets `site_url` to `http://localhost:3000`. The Google provider is stubbed and disabled; to try it, set `SUPABASE_AUTH_EXTERNAL_GOOGLE_CLIENT_ID` and `SUPABASE_AUTH_EXTERNAL_GOOGLE_SECRET` in `supabase/.env` and set `auth.external.google.enabled` to `true`. The `app` schema is intentionally not in `api.schemas`: all data access goes through the FastAPI API.

### OpenTelemetry (opt-in)

The API exports traces, metrics and logs over OTLP only when `OTEL_EXPORTER_OTLP_ENDPOINT` is set. Aspire sets it for you. When unset, nothing changes and the OpenTelemetry packages aren't imported. The exporter is chosen from `OTEL_EXPORTER_OTLP_PROTOCOL`: `grpc` (the default when unset) or `http/protobuf`. Any other value logs a warning and leaves telemetry off; per-signal protocol variables (for example `OTEL_EXPORTER_OTLP_TRACES_PROTOCOL`) are not supported. `OTEL_SERVICE_NAME` (default `hemfin-api`) and the standard endpoint and header variables are honoured by the exporters. Spans record full URLs including query strings, so keep secrets out of query strings.

## Common commands

| Task | Command |
|---|---|
| API dev server | `cd api && uv sync && uv run uvicorn hemfin.main:app --reload` |
| API checks | `cd api && uv run ruff check . && uv run ruff format --check . && uv run mypy src && uv run pytest` |
| Migrations | `cd api && uv run alembic upgrade head` |
| Web dev server | `npm ci` (root), then `cd web && npm run dev` |
| Web checks | `cd web && npm run lint && npm run build` |
| Build the AppHost | `dotnet build aspire/HemFin.AppHost` |
| Validate compose file | `POSTGRES_PASSWORD=placeholder docker compose config` |
| Supabase | `npx supabase start`, `npx supabase status`, `npx supabase stop` |

## Verification status

`dotnet build` of the AppHost, `docker compose config`, the API test suite and the Supabase config were checked without Docker. Not yet verified end to end (needs a running Docker daemon): `aspire run`, `npx supabase start`, `docker compose up`. Manual checklist:

1. `npx supabase start` succeeds and `npx supabase status` shows DB URL `...@127.0.0.1:54322/postgres`.
2. After setting the user secret and running migrations, `aspire run` shows `api` and `web` Running in the dashboard; `GET <api>/health/ready` returns 200; http://localhost:3000 loads and its API URL points at the api endpoint.
3. The dashboard Traces/Structured logs pages show `api` entries (OpenTelemetry on).
4. `docker compose up --build` (with `.env` set) brings up all three services healthy; `curl localhost:8000/health/ready` returns 200; http://localhost:3000 loads.
5. Both paths: the `app` schema exists after migrations and is absent from the Supabase REST API.
