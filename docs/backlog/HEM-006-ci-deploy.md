# HEM-006: CI, scheduled jobs workflow and deployment config

**Phase:** 0 · **Status:** Todo · **Owner:** Engineer · **Depends on:** HEM-001, HEM-003, HEM-004

## Goal
Automate checks and prepare free-tier deployments.

## Acceptance criteria
- [ ] `.github/workflows/ci.yml` on PR + push to main: api job (uv, ruff, mypy, pytest with a postgres:16 service and DATABASE_URL set, alembic upgrade head), web job (npm ci, lint, build, Playwright with browsers), api-client drift check. Uses caching.
- [ ] `.github/workflows/jobs-cron.yml`: daily/weekly schedules calling `$API_BASE_URL/internal/jobs/{name}` with header `X-Job-Secret`; no-op with a notice when secrets are missing; `workflow_dispatch` enabled.
- [ ] **Secret scanning:** a gitleaks job in CI (plus an optional pre-commit hook) with a repo `.gitleaks.toml` allowlisting only `.env.example` placeholders. Findings fail the build.
- [ ] Carried over from HEM-001: the CI api job runs the db-marked tests (including `test_migration_roundtrip`) against Postgres, and a job runs `docker build` on `api/Dockerfile`. `render.yaml` sets `APP_ENV=production`. Swap the startup fail-fast skip from `APP_ENV=="test"` to a dedicated test-only flag that is never set in deployments.
- [ ] Carried over from HEM-004 and HEM-005:
  - Pin Node with `engines` (`>=22.18`) in the root `package.json` plus a root `.nvmrc`, and make CI use it (the tests rely on Node type stripping).
  - The web job runs root `npm ci`, `npm test --workspaces --if-present` and `npm run check:api-drift`. The drift job needs both Node and uv.
  - Add a `web/Dockerfile` only if it's needed. Otherwise make the compose web service work with root npm workspaces (it currently runs `npm ci` inside `web/`).
  - `docs/deploy.md` documents the Vercel workspace setup: root directory `web`, install from the repo root, and the fallback install command `cd .. && npm ci`. Mark it as unverified until the first preview deploy.
- [ ] `render.yaml` blueprint for the api (Docker, free plan, health check path `/health`, env var keys listed without values).
- [ ] Vercel: `web/vercel.json` if needed; document root directory = `web`.
- [ ] `docs/deploy.md`: step-by-step account setup for Supabase (project, pooler connection string, Auth URLs), Render, Vercel, Resend, UptimeRobot, GitHub secrets — with exact env var names. Include a **Secrets** section covering: where each secret lives (Render Environment Group / Secret Files mounted at `/etc/secrets`, Vercel env vars, GitHub Actions secrets), that values are never stored in `render.yaml` (keys only, `sync: false`), the rotation procedure, and an optional central secrets manager (Doppler or Infisical free tier) that syncs to Render, Vercel and GitHub.

## Design notes

## Handoff log

## Review
