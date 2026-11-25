# HEM-006: CI, scheduled jobs workflow and deployment config

**Phase:** 0 · **Status:** Todo · **Owner:** Engineer · **Depends on:** HEM-001, HEM-003, HEM-004

## Goal
Automate checks and prepare free-tier deployments.

## Acceptance criteria
- [ ] `.github/workflows/ci.yml` on PR + push to main: api job (uv, ruff, mypy, pytest with a postgres:16 service and DATABASE_URL set, alembic upgrade head), web job (npm ci, lint, build, Playwright with browsers), api-client drift check. Uses caching.
- [ ] `.github/workflows/jobs-cron.yml`: daily/weekly schedules calling `$API_BASE_URL/internal/jobs/{name}` with header `X-Job-Secret`; no-op with a notice when secrets are missing; `workflow_dispatch` enabled.
- [ ] `render.yaml` blueprint for the api (Docker, free plan, health check path `/health`, env var keys listed without values).
- [ ] Vercel: `web/vercel.json` if needed; document root directory = `web`.
- [ ] `docs/deploy.md`: step-by-step account setup for Supabase (project, pooler connection string, Auth URLs), Render, Vercel, Resend, UptimeRobot, GitHub secrets — with exact env var names.

## Design notes

## Handoff log

## Review
