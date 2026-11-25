# Deploying HemFin (free tiers)

Hosting: Supabase (Postgres, Auth) + Render (API, Docker) + Vercel (web) + Resend (email) + UptimeRobot (keep-alive) + GitHub Actions (CI and scheduled jobs). Nothing here needs a paid plan.

**Verification status.** The CI workflows were run on GitHub. Nothing in the account-setup steps (Supabase, Render, Vercel, Resend, UptimeRobot) could be exercised by the author because it needs your accounts. Those steps are written from the vendors' documented behaviour and are marked **UNVERIFIED** where it matters. Treat the first deploy as the verification.

Contents: [1. Overview](#1-overview-and-order) | [2. Supabase](#2-supabase) | [3. Render](#3-render-api) | [4. Vercel](#4-vercel-web) | [5. Resend](#5-resend) | [6. UptimeRobot](#6-uptimerobot) | [7. GitHub](#7-github-actions) | [8. Secrets](#8-secrets) | [9. Optional: Doppler / Infisical](#9-optional-central-secrets-manager) | [10. Checklist](#10-first-deploy-checklist)

## 1. Overview and order

| Piece | Host | Config file |
|---|---|---|
| Web (Next.js, `web/`) | Vercel | none needed (see section 4) |
| API (FastAPI, `api/`) | Render, Docker, free plan | `render.yaml` |
| Database, Auth | Supabase | `api/alembic` migrations, run by the API container on start |
| CI | GitHub Actions | `.github/workflows/ci.yml` |
| Scheduled jobs | GitHub Actions | `.github/workflows/jobs-cron.yml` |

Do the steps in this order, because later ones need values from earlier ones: Supabase, Render, Vercel, back to Render (set `CORS_ORIGINS` to the Vercel URL), GitHub, Resend, UptimeRobot.

Environment variable names used across the system:

| Variable | Where it is set | Secret? | Meaning |
|---|---|---|---|
| `DATABASE_URL` | Render | **yes** | Supabase pooler connection string. `postgresql://` is rewritten to `postgresql+asyncpg://` by the API. |
| `JOB_SECRET` | Render **and** GitHub Actions secret | **yes** | Shared token for `/internal/jobs/*`. Same value in both places. |
| `APP_ENV` | Render (`render.yaml`) | no | `production` in deployments. |
| `LOG_LEVEL` | Render (`render.yaml`) | no | Default `INFO`. |
| `SUPABASE_URL` | Render | no | `https://<project-ref>.supabase.co`. |
| `SUPABASE_JWT_AUDIENCE` | Render (optional) | no | Defaults to `authenticated`. |
| `CORS_ORIGINS` | Render | no | Comma-separated browser origins, e.g. your Vercel URL. |
| `SECRETS_DIR` | Render (optional) | no | Defaults to `/etc/secrets` (where Render mounts Secret Files). |
| `OTEL_EXPORTER_OTLP_ENDPOINT` | Render (optional) | no | Leave unset to keep telemetry off. |
| `NEXT_PUBLIC_API_URL` | Vercel | no | Public API base URL, no trailing slash. Visible in the browser. |
| `API_BASE_URL` | GitHub Actions **variable** | no | Same API URL, used by the cron workflow. |
| `HEMFIN_TEST_MODE` | tests only | no | **Never set this in a deployment.** It skips the startup database check, and the API refuses to start if it is set while `APP_ENV=production`. |

Later tickets (Auth, email) add more variables (Supabase keys, Resend key, SMTP settings). When they land, add them to this table and to the Secrets section. Anything with a secret value follows section 8.

## 2. Supabase

1. Create an account at supabase.com and a **New project** (free plan). Choose a region near your users and remember it, because Render's region should be close to it. Set a strong **database password** in the form and save it in a password manager. It is shown only at creation.
2. **Connection string.** Open the project, click **Connect**, choose **Connection pooling / Session pooler** (UNVERIFIED label: Supabase renames these tabs from time to time) and copy the URI. It looks like `postgresql://postgres.<project-ref>:<password>@<pooler-host>:5432/postgres`. Substitute your password; URL-encode special characters in it.
   - Use the **session pooler** (port 5432) rather than the transaction pooler (port 6543): the API uses SQLAlchemy with asyncpg and Alembic, and transaction-mode pooling needs prepared-statement workarounds that are not configured here. UNVERIFIED against the real pooler; if you see "prepared statement" errors, tell the team.
   - The direct connection host is IPv6-only on the free plan and Render's free network may not reach it, which is why the pooler is recommended. UNVERIFIED.
3. This string is `DATABASE_URL`. It is a secret: it goes into Render only (section 3). Do not paste it into chat, issues, `render.yaml` or the repo.
4. **Auth URLs** (needed once the Auth ticket lands): Authentication > URL Configuration. Set **Site URL** to your Vercel production URL and add redirect URLs for `https://<your-vercel-domain>/**` and, for local work, `http://localhost:3000/**`. Preview deployments need their own wildcard entry (for example `https://*-<team>.vercel.app/**`). UNVERIFIED; the exact pages are defined by the Auth ticket.
5. **Email via Resend** (after section 5): Authentication > Emails > SMTP Settings. Host `smtp.resend.com`, port `465`, username `resend`, password = your Resend API key. UNVERIFIED.
6. Project settings > API shows the project URL (`SUPABASE_URL`) and the `anon` key (public) and `service_role` key (**secret, never in the browser or in a `NEXT_PUBLIC_` variable**).
7. The `app` schema is created by Alembic on the first API start. You do not create tables by hand.

## 3. Render (API)

Render reads `render.yaml` from the repo root: web service `hemfin-api`, Docker runtime, free plan, region `frankfurt`, health check path `/health`, `APP_ENV=production`. Secret and per-environment variables are listed by **key only** with `sync: false`, so Render prompts for them and nothing sensitive is in the repo.

1. Sign in at render.com with GitHub and grant access to the repo.
2. **New > Blueprint**, pick this repo and branch `main`. Render shows the `hemfin-api` service and prompts for every `sync: false` key:
   - `DATABASE_URL`: the Supabase pooler string from section 2.
   - `SUPABASE_URL`: `https://<project-ref>.supabase.co`.
   - `CORS_ORIGINS`: your Vercel URL, e.g. `https://hemfin.vercel.app`. You may enter a placeholder now and fix it in step 6.
   - `JOB_SECRET`: generate a long random value, for example `openssl rand -hex 32` (or `python -c "import secrets; print(secrets.token_urlsafe(32))"`). Keep a copy for GitHub (section 7).
3. Apply. Render builds `api/Dockerfile` and starts the container. The entrypoint runs `alembic upgrade head` and then `uvicorn` on `$PORT` (Render sets it). The first build takes a few minutes.
4. Verify: open `https://<service>.onrender.com/health` (expect `{"status":"ok"}`) and `/health/ready` (expect `{"status":"ready"}`, which proves the database connection).
5. **Region.** `frankfurt` is a default of this repo, not a requirement. To change it, edit `region:` in `render.yaml` (options include `oregon`, `ohio`, `virginia`, `frankfurt`, `singapore`). A service's region cannot be changed after creation; recreate it. Pick the one nearest the Supabase region.
6. After Vercel gives you the web URL (section 4), set `CORS_ORIGINS` to it in the service's Environment tab and let it redeploy.
7. Free-plan behaviour: the service **sleeps after about 15 minutes idle** and takes up to about a minute to wake. Section 6 mitigates this.
8. If you prefer, put the same keys in a Render **Environment Group** and link it to the service, or provide a **Secret File** named `DATABASE_URL` (mounted at `/etc/secrets/DATABASE_URL`). The API reads env vars first, then secret files in `SECRETS_DIR`. See section 8.

`render.yaml` was not applied by the author (no Render account access). Treat the first Blueprint apply as the verification of the file's schema, and tell the team about any validation error.

## 4. Vercel (web)

The web app is `web/`, an npm workspace of the root `package.json` (workspaces `web` and `packages/*`; one lockfile at the root). The web app imports `@hemfin/api-client` from `packages/api-client`, so Vercel has to install from the repo root.

1. Sign in at vercel.com with GitHub, **Add New > Project**, import this repo.
2. **Root Directory: `web`.** Framework preset: Next.js (auto-detected).
3. **Include source files outside of the Root Directory in the Build Step**: leave it **enabled** (the default). Vercel then checks out the whole repo, which the workspace needs.
4. **Install command.** Leave the default first. Vercel detects the lockfile above the Root Directory and installs from the repo root. If the build fails with `Cannot find module '@hemfin/api-client'` or similar, set **Install Command** to `cd .. && npm ci` in Project Settings > Build and Deployment.
5. Build and output settings: defaults (`next build`, output managed by Next.js). No `vercel.json` is needed; none is committed. Add one only if a feature requires it (for example rewrites or headers).
6. **Node version:** Project Settings > General > Node.js Version should be 22.x or newer (the repo needs `>=22.18`, see `package.json` `engines` and `.nvmrc`). Vercel also reads `engines`.
7. **Environment variables** (Project Settings > Environment Variables, Production and Preview):
   - `NEXT_PUBLIC_API_URL` = the Render URL, e.g. `https://hemfin-api.onrender.com`, no trailing slash.
   - Later tickets add `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY` (public by design). Never create a `NEXT_PUBLIC_` variable for a secret.
   - `NEXT_PUBLIC_*` values are inlined at build time: change one, then redeploy.
8. Deploy. Copy the production URL into Render's `CORS_ORIGINS` (section 3, step 6). Preview deployments use different origins; add them to `CORS_ORIGINS` only if you test the API from previews.

**UNVERIFIED until the first preview deploy:** the workspace install above (root `web`, install from the repo root, fallback `cd .. && npm ci`). It is based on Vercel's documented monorepo behaviour, not on a real deploy. When you complete the first preview deploy, record which install variant worked here.

## 5. Resend

1. Create an account at resend.com (free tier: 3,000 emails per month, 100 per day).
2. **Domains > Add Domain** if you own a domain, and add the DNS records Resend lists (SPF, DKIM). Without a verified domain Resend only lets you send test emails to your own address. UNVERIFIED current limits.
3. **API Keys > Create API Key** with "Sending access". Copy it once. This is a secret: it is used as the Supabase SMTP password (section 2, step 5) and, in later tickets, as an API variable (the Email ticket names it). Store it per section 8.

## 6. UptimeRobot

Keeps the free Render service from sleeping and alerts you when it is down.

1. Create an account at uptimerobot.com (free plan; the minimum interval is 5 minutes).
2. **Add New Monitor**: type **HTTP(s)**, URL `https://<service>.onrender.com/health`, interval 5 minutes.
3. Optionally add an alert contact (email). Use `/health` (liveness, does not touch the database), not `/health/ready`, to avoid pointless database traffic.

Render's free tier has a monthly instance-hour allowance (750 hours at the time of writing; UNVERIFIED, check Render's pricing page). One always-awake service fits.

## 7. GitHub Actions

### CI (`ci.yml`)
Runs on every pull request and on pushes to `main`. Jobs:

| Job | What it does |
|---|---|
| `api` | Starts `postgres:16`, runs `alembic upgrade head`, `ruff check`, `ruff format --check`, `mypy src`, `pytest` (including the db-marked tests and `test_migration_roundtrip`). |
| `docker` | Builds `api/Dockerfile` and runs the image against a Postgres service, then waits for `/health/ready` to return 200. |
| `web` | Root `npm ci`, `npm test --workspaces --if-present`, `npm run check:api-drift`, web lint and build, Playwright (chromium + webkit, all three viewports). Uploads the Playwright report as an artifact if the job fails. |
| `gitleaks` | Scans the full git history with `.gitleaks.toml`. Any finding fails the build. |

Notes:
- Node comes from `.nvmrc` (`22.18.0`), and `package.json` `engines` requires `>=22.18` (the unit tests use Node's built-in TypeScript type stripping).
- Superseded pull request runs are cancelled (`concurrency`). Workflow permissions default to `contents: read`.
- The CI Postgres password in `ci.yml` is a **throwaway, CI-only** value for an ephemeral container that exists only for the duration of the job. It guards no data and is not reused anywhere. `.gitleaks.toml` allowlists exactly that string in exactly that file. It is the one deliberate exception to "no passwords in workflow files"; do not copy the pattern for anything real.
- **gitleaks licence:** the job runs the MIT-licensed gitleaks binary (version and SHA-256 pinned in `ci.yml`) rather than `gitleaks/gitleaks-action`. As far as the author could determine, the action needs a paid `GITLEAKS_LICENSE` key for repositories owned by an organization and is free for personal accounts. UNVERIFIED against the current licence text; the binary has no such requirement, so it works the same for a personal repo or an organization.
- Optional local hook: `.pre-commit-config.yaml` runs gitleaks before each commit (`pip install pre-commit && pre-commit install`).
- Make the checks required: Settings > Branches (or Rules) > protect `main`, require the status checks `api`, `docker`, `web`, `gitleaks`.

### Repository secrets and variables (for the scheduled jobs)
Settings > Secrets and variables > Actions:
- **Variables** tab > New repository variable: `API_BASE_URL` = `https://<service>.onrender.com` (not secret).
- **Secrets** tab > New repository secret: `JOB_SECRET` = the same value you gave Render.

### Scheduled jobs (`jobs-cron.yml`)
- Schedules: daily at 05:15 UTC (`/internal/jobs/daily`) and Mondays 06:30 UTC (`/internal/jobs/weekly`). Run one manually from Actions > Scheduled jobs > Run workflow.
- It calls `POST $API_BASE_URL/internal/jobs/<name>` with the header `X-Job-Secret: $JOB_SECRET`.
- If `API_BASE_URL` or `JOB_SECRET` is unset, the run **succeeds with a notice** and does nothing (so forks and fresh clones stay green).
- **The `/internal/jobs/*` endpoints do not exist yet.** The workflow only calls them. Until a later ticket adds them, a configured run fails with HTTP 404. That is expected; leave the two settings unset until the endpoints ship. The API's side (checking `X-Job-Secret` against `JOB_SECRET` with a constant-time comparison) is part of that later ticket.
- GitHub may disable scheduled workflows after 60 days without repository activity in public repos, and scheduled runs can start several minutes late. UNVERIFIED current policy; re-enable from the Actions tab if needed.
- The first call after a sleep wakes Render, so the workflow retries (3 retries, 20 s apart, 120 s per attempt).

## 8. Secrets

Rule: **no secret is ever committed**, in code, tests, fixtures, Dockerfiles, `render.yaml`, workflow files or docs. No defaults for secrets, not even for development. gitleaks in CI enforces this.

### Where each secret lives

| Secret | Local development | Render (API) | Vercel (web) | GitHub Actions |
|---|---|---|---|---|
| `DATABASE_URL` | `api/.env` (gitignored) or the Aspire user-secret | Environment Group variable, **or** Secret File `DATABASE_URL` | not used | not used (CI uses a throwaway container) |
| `JOB_SECRET` | not needed | Environment Group variable or Secret File | not used | repository **secret** `JOB_SECRET` |
| Resend API key / SMTP password (later tickets) | `api/.env` | Environment Group variable or Secret File | not used unless the web sends mail (then a non-`NEXT_PUBLIC_` Vercel variable) | not used |
| Supabase `service_role` key (later tickets) | `api/.env` | Environment Group variable or Secret File | **never** | not used |
| Public values (`NEXT_PUBLIC_API_URL`, Supabase URL and anon key) | `web/.env.local` | n/a | Project Environment Variables | `API_BASE_URL` as a repository **variable** |

- **Render:** an **Environment Group** (Dashboard > Env Groups) can be shared by several services; **Secret Files** (service > Environment > Secret Files) are mounted at `/etc/secrets/<filename>`. The API's `Settings` reads environment variables first, then files in `SECRETS_DIR` (default `/etc/secrets`), then a local `.env`. A file named `DATABASE_URL` in `/etc/secrets` is read as `DATABASE_URL`.
- **`render.yaml`** contains keys only. Secret keys use `sync: false`, so values are entered in the dashboard and never stored in git.
- **Vercel:** Project Settings > Environment Variables. `NEXT_PUBLIC_` variables are shipped to the browser, so they must be public values only.
- **GitHub Actions:** repository secrets for anything sensitive, repository variables for non-sensitive config. Secrets are masked in logs; never `echo` them.
- **Local:** `.env` files are gitignored; each has a committed `.example` with empty or placeholder values.
- Every new variable must be added to the matching `.env.example` and to the tables in this document.

### Rotation procedure
Rotate on a schedule (for example yearly) and **immediately** if a value may have been exposed (committed, pasted, logged, a person with access leaves).

1. **If a secret was committed:** treat it as compromised. Rotate it first, at the source, using the steps below. Deleting the commit or rewriting history is not enough, because forks, clones and caches may hold it. Then remove it from the repo.
2. **`DATABASE_URL` (Supabase password):** Supabase > Project settings > Database > Reset database password. Build the new pooler string. Update `DATABASE_URL` in Render (variable or Secret File). Render restarts the service when an environment variable changes; with a Secret File, trigger **Manual Deploy > Restart** (UNVERIFIED whether a file change restarts automatically). Check `/health/ready`. The old password stops working the moment you reset it, so do the Render update straight after.
3. **`JOB_SECRET`:** generate a new value (`openssl rand -hex 32`). Update the Render value and the GitHub Actions secret together; between the two updates scheduled calls fail with 401/403, which is harmless (the next run succeeds). Re-run the workflow manually to confirm.
4. **Resend API key:** Resend > API Keys > create a new key, update Supabase SMTP and any Render variable, then delete the old key.
5. **Supabase API keys / JWT secret:** rotate in Project settings > API (UNVERIFIED exact flow), then update Render and Vercel and redeploy both.
6. After any rotation: confirm the app works, then record the date (not the value) in your own notes.

## 9. Optional: central secrets manager

Not required. Useful when the same secret lives in Render, Vercel and GitHub and you want one place to change it. Both options have a free tier whose limits change; check current pricing first. UNVERIFIED: the author did not set up either service.

- **Doppler** (doppler.com): create a project `hemfin` with configs `dev` and `prd`, enter the secrets there, then add **Integrations** for Render (env group or service), Vercel (project) and GitHub (repository secrets). Doppler pushes changes to each target and you redeploy where needed. Locally, `doppler run -- uv run uvicorn hemfin.main:app` injects them without a `.env` file.
- **Infisical** (infisical.com): create a project with environments, add secrets, then use **Integrations** for Render, Vercel and GitHub (Secret Syncs), or the CLI `infisical run -- ...` locally.

Rules that still apply: values stay in the manager, `render.yaml` stays keys-only, and rotation is done in the manager so every target updates. The manager's own access token is a secret too, so store it only in the target platform's secret store (for example a GitHub Actions secret), never in the repo.

## 10. First-deploy checklist

- [ ] Supabase project created, pooler `DATABASE_URL` copied (not committed).
- [ ] Render Blueprint applied; `/health` and `/health/ready` return 200.
- [ ] Vercel project imported with Root Directory `web`; install variant that worked recorded in section 4.
- [ ] `NEXT_PUBLIC_API_URL` set in Vercel; `CORS_ORIGINS` set in Render to the Vercel URL; the landing page API badge shows online.
- [ ] GitHub variable `API_BASE_URL` and secret `JOB_SECRET` set (after the job endpoints exist).
- [ ] Branch protection on `main` requires `api`, `docker`, `web`, `gitleaks`.
- [ ] UptimeRobot monitor on `/health`.
- [ ] Resend domain verified and wired into Supabase SMTP (when Auth ships).
