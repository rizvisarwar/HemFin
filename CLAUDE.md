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
7. **Secrets** live in `.env` files, which are gitignored, and in platform env vars. Never commit them. Update `.env.example` when adding a variable.
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
- **Commit messages** end with the trailer `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.
