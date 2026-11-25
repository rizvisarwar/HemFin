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

### 2026-11-25 Engineer: Round 1 fixes
CI run (all green): https://github.com/rizvisarwar/HemFin/actions/runs/45698231043 (api 25s, docker 56s, gitleaks 7s, web 3m48s). db tests incl. `test_migration_roundtrip` PASSED; compose config step ran; smoke run returned `{"status":"ready"}`.

1. Fixed. No credential in the workflows: `api` and `docker` jobs start `postgres:16` with `docker run`, password from `openssl rand -hex 24`, `::add-mask::`, `DATABASE_URL` via `$GITHUB_ENV`. Service containers and the gitleaks allowlist entry for the password are removed, as is the doc exception (only the `.env.example` placeholder allowlist remains).
2. Fixed. Jobs are named `api`, `docker`, `web`, `gitleaks`; `docs/deploy.md` matches and says to confirm in the branch-protection picker.
3. Fixed. `--retry-all-errors` removed; a loop retries only connection-level curl errors and HTTP 502/503/504. Everything else, including 404 and 500, fails at once.
4. Fixed. A `resolve` job maps the cron string to `daily` or `weekly` and fails on an unknown schedule or job; the `call` job's concurrency group is `jobs-cron-<name>` for scheduled and manual runs.
5. Fixed for actions: all pinned to full SHAs with `# vX.Y.Z` comments; `.github/dependabot.yml` covers github-actions, npm (`/`) and uv (`/api`), weekly. Follow-up: Docker images (`postgres:16`, `python:3.11-slim`, `node:22-bookworm-slim`, the uv image) still use tags; pin by digest and add the docker ecosystem.
6. Fixed. `HEMFIN_TEST_MODE` is only allowed when normalized `APP_ENV` is `local` or `test`; test parametrized over `production`, `staging`, `"Production "`.
7. Fixed. Placeholders `<your-app>.vercel.app`, `<your-service>.onrender.com`.
8. Fixed. Render sleep, Resend and UptimeRobot limits are tagged UNVERIFIED with a "check current limits" note.
9. Fixed. `docker compose config -q` step in the `docker` job, with a generated `POSTGRES_PASSWORD`.

## Review

### 2026-11-25 Reviewer: Round 1

**CHANGES_REQUESTED** (2 blocking findings)

**Evidence.** CI on PR #6 is green: api, docker, web, gitleaks (run 45696511902). The api log shows 29 passed and 0 skipped, including `test_ready_ok_with_db`, `test_app_schema_exists` and `test_migration_roundtrip`. The docker log shows `/health/ready` returned `{"status":"ready"}`. Locally, ruff, ruff format, mypy, the api pytest run (26 passed, 3 db tests skipped because there is no Postgres on this host, and CI covers them), `npm ci`, the workspace tests and `npm run check:api-drift` all pass.

**Secrets (rule 7).** Checked and passing:
- No `pull_request_target` anywhere. `ci.yml` uses only `pull_request` and `push` and references no secrets. `jobs-cron.yml` has no PR trigger. Fork PRs get no secrets.
- Both workflows set top-level `permissions: contents: read`.
- `JOB_SECRET` reaches the call only through env and the `X-Job-Secret` header (`jobs-cron.yml:36`, `:70`). It is not in the URL, there is no `set -x`, and no value is echoed.
- The no-op path is correct: with `API_BASE_URL` or `JOB_SECRET` unset, the call step is skipped and a notice names the variables only (`jobs-cron.yml:56-61`, `:63`). I simulated the shell logic locally.
- No `NEXT_PUBLIC_` secrets were added. Changed files contain no real credentials, apart from the CI password in finding 1.
- Gitleaks binary: the SHA-256 `551f6fc8...470eb` matches the upstream `gitleaks_8.30.1_checksums.txt`. The CI scan covered 44 commits with no leaks.

**Findings**

1. **blocking**: `.github/workflows/ci.yml:33`, `:43`, `:73`, `:99`. The Postgres password `ci-only-throwaway-pg-password` is written literally into the workflow file four times. CLAUDE.md rule 7 says secrets are never written in workflow files, with no defaults "not even for dev". The gitleaks allowlist (`.gitleaks.toml:7-12`) makes the scan pass, but it does not change the rule, and `docs/deploy.md:120` calls this a deliberate exception. Fix: stop storing the value in the file. Start the throwaway Postgres in a step with `POSTGRES_PASSWORD="$(openssl rand -hex 16)"`, run `echo "::add-mask::$PW"`, write `DATABASE_URL` to `$GITHUB_ENV`, and wait with `pg_isready`. Then remove the allowlist entry and the doc exception. If the team wants to keep the exception, the PM must record it in CLAUDE.md first. The reviewer cannot waive a rule.

2. **blocking**: `docs/deploy.md:123` and `:185`. The required status checks are listed as `api`, `docker`, `web`, `gitleaks`. GitHub reports the job `name:` values, which are the names shown by `gh pr checks 6`: "api (ruff, mypy, pytest + postgres)", "docker (build + smoke run)", "web (tests, drift, lint, build, playwright)", "gitleaks (secret scan)". Following the doc as written would require checks that never report, so no PR could merge. Fix: either give the jobs short `name:` values (for example `name: api`) and keep the doc, or list the exact names. Confirm in the branch-protection picker after the first run.

3. **nit**: `.github/workflows/jobs-cron.yml:69-70`. `--retry-all-errors` retries the POST on every failure, including 404 and 500. Once `/internal/jobs/*` exists, a 500 after a partly completed job would run it again. Fix: drop `--retry-all-errors` and keep the retries for cold-start failures (timeouts, connection errors, 502-504). Make the endpoints idempotent when they land.

4. **nit**: `.github/workflows/jobs-cron.yml:27` and `:45`. The concurrency group for scheduled runs is keyed on the cron string and the manual group on the job name, so a manual `daily` can overlap a scheduled `daily`. The weekly match on the literal `"30 6 * * 1"` falls back to daily silently if the cron string changes. Fix: key the group on the resolved job name from the `job` step output, and fail loudly on an unknown schedule.

5. **nit**: pinning. Every third-party action is pinned to a tag, not a SHA: `ci.yml:48, 49, 82, 83, 85, 118, 119, 125, 135, 146, 163`. Images float too: `postgres:16` (`ci.yml:26`, `:67`), `python:3.11-slim` (`api/Dockerfile:1`), `node:22-bookworm-slim` (`docker-compose.yml`, web service). Fix: pin actions to full commit SHAs with a `# vX` comment, add a Dependabot `github-actions` config, and pin images by digest later. The SHAs for the tags in use are visible in the CI log.

6. **nit**: `api/src/hemfin/main.py:27` and `api/src/hemfin/core/config.py:42`. The refusal only checks `APP_ENV == "production"`. The ticket says the flag is never set in deployments, so any other deployed environment (for example `APP_ENV=staging`) would skip the DB fail-fast. Fix: allow the flag only when `APP_ENV` is in `{"local", "test"}`, normalize the value, and add a test for `staging`.

7. **nit**: `docs/deploy.md:60` (`https://hemfin.vercel.app`) and `:82` (`https://hemfin-api.onrender.com`). These look like live domains, and the brief says no real values anywhere. Use `https://<your-app>.vercel.app` and `https://<service>.onrender.com`.

8. **nit**: `docs/deploy.md:66`, `:91`, `:99`. The Render 15-minute sleep, the Resend free-tier limits and the UptimeRobot 5-minute minimum are stated as fact without the UNVERIFIED tag that line 103 uses. Add the tag or a "check current pricing" note.

9. **nit**: `docker-compose.yml` web service (lines 49-76). The change is not validated by any CI step, and the author could not run Docker. The README's `docker compose config` check is manual only. Consider a CI step for `docker compose config -q` (with a non-secret placeholder). The root-workspace layout itself is sound: root `node_modules` and `web/node_modules` are named volumes, so host installs do not clash.

**Acceptance criteria (reviewer status)**
- [x] `ci.yml` api, web, drift and cache: met (see 1 and 5).
- [x] `jobs-cron.yml`: met. Not run on GitHub yet, as the ticket notes.
- [x] Gitleaks job and config: met. Allowlist is narrow. Pre-commit hook present. Depends on the fix in 1.
- [x] HEM-001 carry-overs: met. The db tests run in CI, the docker build and smoke run pass, `APP_ENV=production` is set. The HEMFIN_TEST_MODE tests exist; see 6.
- [x] HEM-004/005 carry-overs: met. `.nvmrc` 22.18.0 and `engines >=22.18`, CI uses `.nvmrc`, web job runs root `npm ci`, tests and drift. No `web/Dockerfile`, compose uses root workspaces; see 9.
- [x] `render.yaml`: met. Keys only, `sync: false` on secrets, `APP_ENV=production`, `/health`, free plan. Not validated against Render (disclosed).
- [x] Vercel: met. No `vercel.json`; root directory `web` is documented.
- [ ] `docs/deploy.md`: not met until 2 is fixed. Sections are complete and the UNVERIFIED marking is mostly right. See 7 and 8.

**Commands run (Windows, Git Bash)**
- `git fetch origin && git checkout -B review-hem-006 origin/hem-006-ci-deploy`: ok.
- `gh pr checks 6 -R rizvisarwar/HemFin`: all four checks pass.
- `gh run view 45696511902 -R rizvisarwar/HemFin --job <id> --log`: api and docker logs as above, gitleaks "no leaks found", web Playwright 25 passed and 2 skipped. The ticket cites run 45696029191. It is also green, and the current head run is 45696511902.
- `py -m uv sync`: ok.
- `py -m uv run ruff check .`: All checks passed.
- `py -m uv run ruff format --check .`: 14 files already formatted.
- `py -m uv run mypy src`: no issues in 9 source files.
- `py -m uv run pytest -v -rs`: 26 passed, 3 skipped (the db tests, no DATABASE_URL on this host).
- `npm ci`: ok. npm reports 4 moderate audit findings. The lockfile is not changed by this PR.
- `npm test --workspaces --if-present`: web 5/5 pass, api-client 5/5 pass.
- `npm run check:api-drift`: "API client is up to date."
- Gitleaks download: checksum matches upstream. The Linux binary cannot run on this Windows host, so no local scan; the CI scan is the evidence.
- Cron config simulation (unset secret, unset URL, weekly schedule, manual weekly): the job name and no-op behaviour are correct.
- YAML parse of `ci.yml`, `jobs-cron.yml`, `render.yaml`, `docker-compose.yml`, `.pre-commit-config.yaml`: ok.
- Not run: `docker compose config` (no Docker daemon), Render Blueprint validation (no account), `npm run lint` and `npm run build` (covered by CI).
