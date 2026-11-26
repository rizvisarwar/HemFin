# HemFin

Household finance web app: personal (private) and household (shared) finances, contracts, income, reports, forecasts, notifications, and AI agents. The full plan is in `docs/PROJECT_PLAN.md`. Read it before starting any non-trivial work.

## Stack
- **api/**: Python 3.11+, FastAPI, Pydantic v2, SQLAlchemy 2 (async, asyncpg), Alembic, pytest. Packages are managed with `uv`. Source lives in `api/src/hemfin/`.
- **web/**: Next.js (App Router, TypeScript strict), Tailwind CSS, shadcn/ui, Playwright.
- **packages/api-client/**: TypeScript client generated from the API's OpenAPI spec. Never edit generated files by hand.
- **aspire/HemFin.AppHost/**: .NET Aspire AppHost used for local orchestration only.
- **Hosting (free tiers):** Vercel (web), Render (api), Supabase (Postgres, Auth, Storage), Resend (email), GitHub Actions (CI and cron).

## Non-negotiable rules
1. **Spaces privacy model.** Every finance record has a `space_id`. Every route that touches finance data is under `/api/v1/spaces/{space_id}/...` and depends on `require_space_member(...)`. A non-member gets **404**, not 403. Agent tools must call the same service functions, so they get the same checks.
2. **Layering:** router → service → repository/model. Routers stay thin. Business rules live in services.
3. **Money:** use `Decimal` with an ISO-4217 `currency` field. Never use floats. Store all datetimes as UTC (`timestamptz`).
4. **Database:** all app tables live in the Postgres schema `app`, never in `public`. Every schema change goes through an Alembic migration.
5. **API:** routes are versioned under `/api/v1`, errors are RFC 7807 problem+json, and lists use cursor pagination. After any API change, regenerate the client with `npm run gen:api` from the repo root.
6. **Web is mobile-first and responsive.** It must work at 375, 768 and 1280 px:
   - No horizontal scroll.
   - Tap targets of at least 44 px.
   - Bottom nav on phones, sidebar from `md` up.
   - Tables become card lists on phones.
   - Meet WCAG AA.
7. **Secrets: never hardcode them.** This covers API keys, DB passwords, JWT secrets, SMTP keys, the job secret and anything similar.
   - Secrets are never written in code, tests, fixtures, Dockerfiles, `render.yaml`, workflow files or docs. No default values for secrets, not even for "dev".
   - **API:** all config comes from `hemfin.core.config.Settings` (pydantic-settings). It reads, in priority order: env vars, then **secret files** in `SECRETS_DIR` (default `/etc/secrets`, where Render mounts Secret Files), then a local `.env` for development only.
     - Secret fields are typed `SecretStr`, so they're masked when printed.
     - Read them with `.get_secret_value()` only where they're used.
     - Never log settings or secret values.
     - A required secret that's missing must stop the app at startup with a clear error naming the variable, not its value.
   - **Web:** server-only secrets never get a `NEXT_PUBLIC_` prefix. Only public values (API URL, Supabase URL and anon key) may be exposed to the browser.
   - **Where secrets live:**
     - Local: `.env` / `.env.local` (gitignored).
     - Render: Environment Group or Secret Files.
     - Vercel: Project Environment Variables.
     - CI: GitHub Actions secrets.
     - `render.yaml` lists keys with `sync: false` only, never values.
   - Every new variable goes in the matching `.env.example` with an empty or placeholder value and a comment.
   - **CI runs gitleaks.** A detected secret blocks the merge. If a secret is ever committed, rotate it immediately; deleting the commit is not enough.
8. **Tests:** every ticket adds or updates tests. Run `pytest` in `api/` and `npm run lint && npm run build` in `web/` before opening a PR.

## Commands
- API: `cd api && uv sync && uv run uvicorn hemfin.main:app --reload`, `uv run pytest`, `uv run ruff check . && uv run ruff format --check . && uv run mypy src`
- Web: `cd web && npm install && npm run dev`, `npm run lint`, `npm run build`, `npx playwright test`
- Local stack: `aspire run` (from `aspire/HemFin.AppHost`) or `docker compose up`

## Team process
The main Claude Code session is the **Project Manager (PM)**. The other roles are subagents defined in `.claude/agents/`:
- `fullstack-engineer` (Sonnet)
- `reviewer-tester` (Haiku)
- `ux-designer` (Haiku)

Agents don't talk to each other directly. They communicate through ticket files and PRs, and the PM passes information between them.

- **Tickets:** `docs/backlog/HEM-###-slug.md`. **Board:** `docs/backlog/board.md`.
- **Lifecycle:** `Todo → Design (UI tickets only) → In Progress → In Review → Done`.
- **Branches:** `hem-###-slug`, branched from `main`. One ticket per PR. The PR title starts with `HEM-###:`.
- **Handoffs:** each agent appends a dated entry to the ticket's **Handoff log**. Say what was done, what's left, and how to verify it.
- **Review verdict:** the reviewer writes `APPROVED` or `CHANGES_REQUESTED`, with numbered findings, in the ticket's **Review** section and as a PR comment.
- **Escalation:** after 3 review rounds without approval, the PM escalates to the user.
- **Extra security review:** the PM personally reviews tickets that touch auth, authorization/Spaces, invitations, agent tools or file upload before merging.
- **Merging:** only the PM merges, with `gh pr merge --squash --delete-branch`, after review is `APPROVED` and CI is green.
- **Phase gates:** at the end of each phase the PM stops for a user demo and approval.
- **Permission refusals:**
  - If the sandbox, a permission check or a hook refuses a command, don't retry the same action through another shell, tool or workaround. Stop and report it to the PM, who brings it to the user.
  - **Exception:** when the refusal message itself names a compliant form (for example "too complex to verify, split into simpler commands"), do exactly that. Use plain single commands, no `cd … &&` chains, absolute paths, and send output to files instead of pipes. Mention it in your report.
- **Stacked PRs:** before merging a parent PR with `--delete-branch`, retarget its child PR to `main` (`gh pr edit <child> --base main`). Otherwise GitHub closes the child for good when the base branch is deleted. After the parent is squash-merged, update the child with `git merge origin/main`, never with a force-push.
- **Pushing branches with workflow changes:** use `gh` as the credential helper, for example `git -c credential.helper= -c "credential.helper=!gh auth git-credential" push`.
- **Commit messages** end with a trailer for the model that actually wrote the commit: PM (main session) `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`, Engineer `Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>`, Reviewer and Designer `Co-Authored-By: Claude Haiku 5.5 <noreply@anthropic.com>`. Commits made before 2026-11-26 all say Opus 5.5, whichever model wrote them.
