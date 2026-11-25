# HEM-006: CI, scheduled jobs workflow and deployment config

**Phase:** 0 · **Status:** In Review · **Owner:** Engineer · **Depends on:** HEM-001, HEM-003, HEM-004

## Goal
Automate checks and prepare free-tier deployments.

## Acceptance criteria
- [x] `.github/workflows/ci.yml` on PR + push to main: api job (uv, ruff, mypy, pytest with a postgres:16 service and DATABASE_URL set, alembic upgrade head), web job (npm ci, lint, build, Playwright with browsers), api-client drift check. Uses caching.
- [x] `.github/workflows/jobs-cron.yml`: daily/weekly schedules calling `$API_BASE_URL/internal/jobs/{name}` with header `X-Job-Secret`; no-op with a notice when secrets are missing; `workflow_dispatch` enabled.
- [x] **Secret scanning:** a gitleaks job in CI (plus an optional pre-commit hook) with a repo `.gitleaks.toml` allowlisting only `.env.example` placeholders. Findings fail the build.
- [x] Carried over from HEM-001: the CI api job runs the db-marked tests (including `test_migration_roundtrip`) against Postgres, and a job runs `docker build` on `api/Dockerfile`. `render.yaml` sets `APP_ENV=production`. Swap the startup fail-fast skip from `APP_ENV=="test"` to a dedicated test-only flag that is never set in deployments.
- [x] Carried over from HEM-004 and HEM-005:
  - Pin Node with `engines` (`>=22.18`) in the root `package.json` plus a root `.nvmrc`, and make CI use it (the tests rely on Node type stripping).
  - The web job runs root `npm ci`, `npm test --workspaces --if-present` and `npm run check:api-drift`. The drift job needs both Node and uv.
  - Add a `web/Dockerfile` only if it's needed. Otherwise make the compose web service work with root npm workspaces (it currently runs `npm ci` inside `web/`).
  - `docs/deploy.md` documents the Vercel workspace setup: root directory `web`, install from the repo root, and the fallback install command `cd .. && npm ci`. Mark it as unverified until the first preview deploy.
- [x] `render.yaml` blueprint for the api (Docker, free plan, health check path `/health`, env var keys listed without values).
- [x] Vercel: `web/vercel.json` if needed; document root directory = `web`.
- [x] `docs/deploy.md`: step-by-step account setup for Supabase (project, pooler connection string, Auth URLs), Render, Vercel, Resend, UptimeRobot, GitHub secrets — with exact env var names. Include a **Secrets** section covering: where each secret lives (Render Environment Group / Secret Files mounted at `/etc/secrets`, Vercel env vars, GitHub Actions secrets), that values are never stored in `render.yaml` (keys only, `sync: false`), the rotation procedure, and an optional central secrets manager (Doppler or Infisical free tier) that syncs to Render, Vercel and GitHub.

## Design notes

## Handoff log

### 2026-11-25 Engineer
PR: https://github.com/rizvisarwar/HemFin/pull/6. CI run (all four jobs green): https://github.com/rizvisarwar/HemFin/actions/runs/45696029191

Done:
- `.github/workflows/ci.yml`: jobs `api` (postgres:16 service, alembic upgrade head, ruff, mypy, pytest with db tests: `test_ready_ok_with_db`, `test_app_schema_exists`, `test_migration_roundtrip` all PASSED, 29 passed 0 skipped), `docker` (buildx build + container smoke run, `/health/ready` returned `{"status":"ready"}`), `web` (root npm ci, workspace tests, drift check, lint, build, Playwright chromium+webkit 25 passed/2 skipped, report artifact on failure), `gitleaks` (binary 8.30.1, SHA-256 pinned, full history, 43 commits, no leaks). Concurrency cancels superseded PR runs; default `contents: read`.
- `.github/workflows/jobs-cron.yml`: schedule + `workflow_dispatch`; notice and no-op when `API_BASE_URL` / `JOB_SECRET` are unset. Not executed on GitHub (see limitations).
- `HEMFIN_TEST_MODE` replaces the `APP_ENV=="test"` skip; refused when `APP_ENV=production`; tests added.
- `engines` (`>=22.18`) + `.nvmrc` (22.18.0); CI uses the `.nvmrc`. This exposed a real bug: `web/src/lib/api-health.test.ts` timeout test hung on Node 22 (AbortSignal.timeout timers are unref'd); fixed in the test with a ref'd keep-alive timer, assertions unchanged.
- `render.yaml`, `.gitleaks.toml`, optional `.pre-commit-config.yaml`, compose web service moved to root workspaces, README updated, `docs/deploy.md`. No `vercel.json` (not needed).

Notes and limitations:
- `astral-sh/setup-uv` has no floating major tag past v7, so it is pinned to `v10.4.0`; other actions use major tags.
- The gitleaks default rules do not flag the CI-only password even without the allowlist (checked locally); the narrow allowlist in `.gitleaks.toml` is a safeguard in case rules change.
- Unverified: Render Blueprint apply, Vercel workspace install (fallback `cd .. && npm ci` documented), Supabase pooler/Auth steps, Resend, UptimeRobot, the compose web service (no Docker locally), `jobs-cron.yml` run, gitleaks-action licence terms (binary used instead).
- Follow-ups: build `/internal/jobs/*` endpoints and the `JOB_SECRET` check; Playwright's webServer builds web again after the lint/build step (about 30 s extra; kept because the build step doubles as a standalone check).

## Review
