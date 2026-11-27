# HemFin: Household Finance App, Project Plan

## Context
HemFin is a new, API-first app for managing personal and family finances. The repo is empty apart from an initial commit. A single user can sign up with a password or Google and keep **private personal finances**. They can also invite family members by email to a **shared household**. Users track insurance, utilities, subscriptions and memberships, record income, view spending reports and forecasts, get alerts before contracts expire, receive cost-saving suggestions, and upload insurance contracts for AI analysis. Email and WhatsApp notifications come later. The API serves a React website now and a React Native mobile app later.

**Decisions so far:**
- **Backend:** Python FastAPI. .NET would work too, but Python has the best tooling for agents, LLMs, PDFs and forecasting, so we stay with it.
- **Scope for now: web app only.** A Next.js site that is **fully responsive and mobile-first**, so it works well on phones in the browser. The API stays API-first so a native app can be added later.
- **Deferred:** the native mobile app (Expo, App Store, Play Store) and WhatsApp notifications. The design leaves room for both, but neither is built in this plan.
- **Hosting:** Free tiers only. Aspire is used for local debugging.
- **Market:** Sweden only, SEK (POC, user decision 2026-11-27). Multi-currency later.
- **Agents in the app:** The app includes agentic workflows.
- **Dev team:** The work is built by a team of Claude agents.
- **Ticket tracking:** Tickets are Markdown files in the repo (no Jira yet).
- **Approvals:** The PM merges PRs; you approve each phase before it starts.
- **POC first (2026-11-27):** Keep it simple and improve the product iteratively. Users enter data by hand. Contract documents are not stored. AI extraction comes later and saves only the extracted fields.
- **Repo:** GitHub repo `rizvisarwar/HemFin`. It isn't added as a remote locally yet.

---

## 1. Free Deployment Stack

| Concern | Service (free tier) | Notes |
|---|---|---|
| Web (Next.js) | **Vercel Hobby** | Deploys from GitHub with preview URLs per PR. Hobby is for non-commercial use only. If HemFin is ever sold, move to Cloudflare Pages or Vercel Pro. |
| API (FastAPI, Docker) | **Render free web service** | 512 MB RAM, 750 h/month (enough for 1 always-on service). It sleeps after 15 min idle, so **UptimeRobot (free)** pings `/health` every 5 min to keep it awake. |
| Postgres | **Supabase** | 500 MB database. The API connects through the Supavisor **session pooler**, because the direct connection is IPv6-only and Render can't reach it. Free projects pause after 7 days without activity, which the daily job prevents. |
| Auth | **Supabase Auth** | Email and password, email verification, password reset and Google OAuth, free for up to 50k monthly users. Its SDKs work on both web and Expo. |
| File storage | **Supabase Storage** | 1 GB, private bucket. All access goes through signed URLs issued by the API. |
| Transactional email | **Resend** | 3,000 emails/month (100/day). Also used as Supabase Auth's SMTP server, because the built-in sender is heavily rate-limited. |
| Scheduled jobs | **GitHub Actions cron** | Calls `POST /internal/jobs/{daily,weekly}` on the API with a shared secret. Uses only a few minutes of Actions time per month. |
| CI | **GitHub Actions** | 2,000 free min/month for private repos. |
| Errors / monitoring | Sentry free plus Render logs | |

**The one cost that can't be avoided:** LLM calls (Claude API) are pay per use. They're kept low with `claude-haiku-5-5` for extraction and classification and `claude-sonnet-5-5` for analysis and chat, plus prompt caching and a monthly token budget per user. Every AI feature can be switched off with a flag, so the rest of the app costs nothing to run.

**Local development:** `supabase start` (Supabase CLI) runs local Postgres, Auth, Storage and a mail catcher. The **Aspire AppHost** runs the api (`AddUvicornApp`) and web (`AddJavaScriptApp`), points them at the local Supabase, and sends OpenTelemetry to the Aspire dashboard. There's also a `docker-compose.yml` for people who don't use Aspire.

---

## 2. Architecture

```
/api                    FastAPI (src/hemfin/...), Alembic, pytest
/web                    Next.js (App Router, TS, Tailwind, shadcn/ui)
/packages/api-client    TS client generated from OpenAPI (web now, native app later)
/aspire/HemFin.AppHost  Aspire AppHost for local orchestration
/supabase               Supabase CLI config, auth email templates
/docs/backlog           Tickets (Markdown), board.md
/docs/design            Design system, page specs
/.claude/agents         Dev-team agent definitions
.github/workflows       ci.yml, jobs-cron.yml
```

**API conventions**
- All routes are under `/api/v1`, and the OpenAPI spec is the contract.
- Errors use RFC 7807 problem details. Lists use cursor pagination.
- Money is stored as a `Decimal` with an ISO-4217 currency code. All times are stored in UTC.

**Layering:** routers → **service layer** → repositories. HTTP routes, cron jobs and **agent tools** all call the same services, so business rules and permission checks live in exactly one place.

**Auth:**
- Clients sign in through the Supabase Auth SDK and call the API with the Supabase access token.
- The API checks that token against Supabase's published signing keys (JWKS) in `core/deps.py::get_current_user`.
- On a user's first request, the API creates their `app.users` row and their personal space.

**Privacy model ("Spaces"):**
- A `Space` is either `personal` or `household`. Members are linked through `SpaceMembership(role: owner|admin|member)`.
- Every finance record has a `space_id`.
- `require_space_member(role)` is the single authorization gate. Routes look like `/spaces/{space_id}/...`.
- All app tables live in a **`app` schema that Supabase's auto-generated REST API doesn't expose**. That way the public anon key can't read them directly; only our API can.

**Data model:**
- **Users and profiles:** `User(id = supabase auth uid)`, `Profile(phone, base_currency, locale)`, `Address`.
- **Households:** `Space`, `SpaceMembership`, `Invitation(token_hash, email, role, expires_at, status)`.
- **Contracts:** `Category` (seeded with insurance.home, insurance.car, utility.electricity, subscription.*, membership.gym, membership.kids_activity…). `Contract` covers every recurring obligation, with amount, currency, frequency, start/end, notice_period_days, auto_renew and the household member it applies to.
- **Money in and out:** `Expense` (one-off payments), plus `IncomeSource` and `IncomeEntry` (salary, business or other income).
- **Documents:** `Document`, `DocumentAnalysis`.
- **Notifications:** `Notification`, `NotificationPreference(channel: in_app|email)`. The channel list can grow later to add WhatsApp or push.
- **Suggestions:** `Suggestion(type, estimated_saving, status)`.
- **Exchange rates:** deferred (SEK only). `FxRate` and the ECB job were removed in HEM-024; records keep a `currency` column (always "SEK") so multi-currency can return without a data migration.
- **Agent tables:** `AgentRun`, `AgentStep`, `PendingAction` (see §3).

**Background work without a paid worker:**
- Scheduled jobs are run by GitHub Actions cron, which calls internal endpoints.
- Short async tasks (document analysis, agent runs) use FastAPI `BackgroundTasks`, with a `jobs` table in Postgres for status and retries. The always-on Render instance makes this reliable enough.
- If a dedicated worker is needed later, the job processor can move to one without other changes.

---

## 3. Agentic Workflows in the App

**Agent runtime (`api/src/hemfin/agents/`):**
- **`runtime.py`:** Wraps the Anthropic Python SDK's tool-use loop (tool runner). It enforces a maximum number of steps, a token budget per user and per run, and a timeout. It also records every step to `AgentRun`/`AgentStep` (prompt version, model, tool calls, tokens, cost).
- **`tools/`:** A typed registry of tools. Each tool is a thin wrapper over a service function and **runs as the calling user, inside one space**, so the Spaces rules also apply to agents. Tools are tagged `read` or `write`.
- **Approval step:** `write` tools never act directly. They create a `PendingAction`, which the user approves in the UI or the app, for example "Add Netflix 129 SEK/month? Approve / Edit / Reject".
- **Prompt-injection protection:** Uploaded documents and user-entered text are treated as untrusted data. The document-analysis agent gets **no write tools**, and tool outputs are wrapped and labelled as data.
- **Feature flags and kill switch** for each agent, plus an admin view of runs and costs.

**Agents, in delivery order:**
1. **Savings Agent** (weekly cron): Takes the output of a deterministic rules engine and the space's data. The rules cover duplicate subscriptions, price increases, upcoming insurance renewals, annual vs. monthly billing, and the share of income spent on subscriptions. The agent ranks and explains suggestions with estimated savings, and can draft cancellation or negotiation emails.
2. **Contract Analysis Agent:** Runs on upload in a multi-step pipeline:
   - Extract text with pypdf/pdfplumber, falling back to OCR.
   - Extract structured fields with Haiku: insurer, premium, deductible, coverage, exclusions, dates and notice period.
   - Validate them against the linked contract.
   - Generate advice with Sonnet: coverage gaps and overlaps, deductible-vs-premium trade-offs, questions to ask other insurers, and a negotiation script.
   - Offer a `PendingAction` to create or update the contract.

   Real quote comparison plugs in later through a `QuoteProvider` interface. The user must give explicit consent before a document is sent to the LLM.
3. **Finance Assistant (chat):** Chat in the web app at `POST /spaces/{id}/assistant/messages`, with streaming over SSE. Read tools: spending queries, forecast, contracts, upcoming renewals. Write tools that need approval: add expense, add contract, mark notification done. Example questions: "How much did we spend on the kids' activities this year?" and "What renews next month?"
4. **Onboarding Agent** (later): The user pastes or uploads a bank statement CSV, the agent detects recurring payments, and proposes contracts for the user to approve.
5. **HemFin MCP server** (later): Exposes the same tool registry over MCP, so users can connect their own Claude to their HemFin data with OAuth.

---

## 4. Phased Delivery
Each phase ships the API with tests, regenerates the TS client, adds the matching web screens, and **deploys to production**. You approve each phase before it starts and get a demo when it ends.

**Responsive rules for every web screen:**
- Screens are designed mobile-first and must work at 375, 768 and 1280 px wide.
- On phones, navigation is a bottom bar or drawer; on desktop it's a sidebar.
- On phones, tables turn into card lists and dialogs open as bottom sheets.
- Tap targets are at least 44 px.
- No horizontal scrolling.
- A screen isn't "done" until Playwright passes on a phone and a desktop viewport and the Designer has signed off on the screenshots.

| # | Phase | Main deliverables |
|---|---|---|
| 0 | **Foundations & team setup** | Add `origin` for `rizvisarwar/HemFin`, rename `master` to `main`, push. Monorepo scaffold, linters, FastAPI skeleton (`/health`, settings, logging, errors), Alembic `app` schema baseline, Next.js shell, api-client generation, Aspire AppHost, local Supabase, CI. **First deploy** of an empty app to Vercel, Render and Supabase, plus UptimeRobot. Create `.claude/agents/*`, `CLAUDE.md` and `docs/backlog`. |
| 1 | **Auth & Profile** | Supabase Auth (email/password, verification, reset, Google) with Resend SMTP and branded templates. JWT verification in the API. User and personal-space setup on first request. Profile with E.164 phone, addresses, base currency. Web pages for login, sign-up, reset and profile. |
| 2 | **Households & Invitations** | Household CRUD and roles. Invitations with a hashed token and 7-day expiry, emailed via Resend. On the accept page, a logged-out user signs in or signs up with the token kept, and their email must match the invite. Decline, resend and revoke. Household switcher in the web app. |
| 3 | **Core Finance** | Contracts, expenses, income and categories. Schedule service for next payment, renewal and notice deadline. Web dashboard and forms. |
| 4 | **Documents** | **Dropped for the POC (user decision 2026-11-27).** HemFin does not store contract documents. Users enter contracts and expenses by hand (Phase 3). |
| 5 | **Notifications** | Daily cron finds expiries, notice deadlines and upcoming payments, with deduplication via an idempotency key. `NotificationChannel` with in-app and email. Bell icon, notification centre, preferences. |
| 6 | **Reports & Forecast** | Spending by date range, grouped by category, month or contract. Income vs. expense, comparison with the previous period, CSV export. Forecast from contract schedules and income, plus a smoothed trend for variable spending with confidence bands. Charts (Recharts). |
| 7 | **Agent platform + Savings Agent** | Runtime, tool registry, `AgentRun` and `PendingAction` with approval UI, budgets, flags. Rules engine plus the Savings Agent, shown as suggestion cards. |
| 8 | **Contract Analysis Agent** | Later iteration. The uploaded file is processed in memory and never stored. Only the extracted fields the user reviews and approves are saved. Includes the consent step and the GDPR items (health data in insurance contracts, Anthropic DPA, privacy notice). |
| 9 | **Finance Assistant chat** | Streaming chat UI and read/write tools with approval. |
| 10 | **Hardening & later items** | GDPR export and account deletion. Audit log. Security review. PWA manifest so the site can be added to a phone's home screen. Onboarding Agent and MCP server. |

**Deferred, to plan later:** native mobile app (Expo, App Store and Play Store), WhatsApp notifications, push notifications.

---

## 5. Dev Team: Claude Agents

**How it runs:** In Claude Code, subagents can't start other subagents. So the **Project Manager is the main Claude Code session, running on Opus 5.5**. It starts the other roles with the Agent tool, using definitions in `.claude/agents/`. Agents don't talk to each other directly. They communicate through **ticket files and PRs**, and the PM passes information between them.

| Role | Definition | Model | Owns | Doesn't |
|---|---|---|---|---|
| **Project Manager** | Main session. Rules go in a "Team process" section in `CLAUDE.md` | Opus 5.5 | Splits each phase into tickets, decides order and dependencies, dispatches agents, passes feedback along, merges PRs (`gh pr merge`) once review is approved and CI passes, updates `board.md`, reports to you at the end of each phase | Write feature code |
| **Senior Full-stack Engineer** | `.claude/agents/fullstack-engineer.md` (`model: sonnet`) | Sonnet 5.5 | Implements tickets end to end (API, migrations, tests, web wiring) on branch `hem-<id>-<slug>`, opens the PR, writes a handoff note in the ticket | Merge |
| **Mid-level Engineer (Review & QA)** | `.claude/agents/reviewer-tester.md` (`model: haiku`, no file editing) | Haiku 5.5 | Reviews the PR diff against a checklist (space isolation, validation, tests, conventions). Runs pytest and Playwright. Posts `APPROVED` or `CHANGES_REQUESTED` with specific findings in the ticket and as a PR comment | Edit code |
| **Designer** | `.claude/agents/ux-designer.md` (`model: haiku`) | Haiku 5.5 | `docs/design/` (design tokens, page specs, user flows). Presentational components in `web/src/components/ui` (Tailwind, shadcn/ui, mobile-first, WCAG AA). Reviews Playwright screenshots at 375, 768 and 1280 px wide and files design-fix tickets | API or business logic |

**Ticket lifecycle** (one file per ticket, `docs/backlog/HEM-###-slug.md`, with these sections: Goal, Acceptance criteria, Dependencies, Design notes, Handoff log, Review):
`Todo → Design (UI tickets only) → In Progress → In Review → Done`
1. The PM writes the ticket. For UI tickets, the Designer writes a spec or components first.
2. The Engineer implements it and opens a PR. Tickets with no dependencies on each other run **in parallel in separate git worktrees** (`isolation: "worktree"`).
3. The Reviewer reviews and tests. If changes are needed, the PM sends the findings back to the Engineer. After **3 review rounds**, the PM escalates to you.
4. **Extra check:** The Reviewer runs on Haiku, so for tickets that touch auth, authorization or Spaces, invitations, agent tools, or file upload, **the PM also does its own final security review** before merging.
5. The PM merges the PR, updates `board.md`, and at the end of the phase deploys and stops for your demo and approval.

Later, tickets can move to Jira through the Atlassian MCP with the same structure.

---

## Key files (created in Phase 0 and Phase 1)
- `CLAUDE.md` (conventions and team process), `.claude/agents/{fullstack-engineer,reviewer-tester,ux-designer}.md`, `docs/backlog/board.md`
- `api/src/hemfin/main.py`, `core/{config,security,deps}.py` (`get_current_user`, `require_space_member`), `modules/<feature>/{router,schemas,models,service}.py`, `agents/{runtime.py,tools/}`
- `aspire/HemFin.AppHost/Program.cs`, `supabase/config.toml`, `docker-compose.yml`, `render.yaml`, `.github/workflows/{ci,jobs-cron}.yml`

## Verification
- **pytest** runs against local Supabase Postgres. Required test suites:
  - **Space isolation:** another user and non-members get 404, and agent tools are checked the same way.
  - **Invitations:** a new user and an existing user can accept; an invite for a different email is rejected.
  - **Calculations:** schedules and forecasts.
  - **Rules engine.**
  - **Notification deduplication.**
  - **Agent runtime:** uses a mocked Anthropic client, and checks that write tools create a `PendingAction`.
- **CI:** OpenAPI drift check (fails if the TS client wasn't regenerated). Lint and type checks. Web build.
- **Playwright E2E** (local and on Vercel preview URLs). Every test runs in two projects, **phone (iPhone 13 / Pixel 7 profiles) and desktop Chrome**, and saves screenshots for the Designer's review:
  - **Sharing flow:** sign up and verify (local mail catcher), add a personal and a household contract, invite a member, the member accepts and sees only the household contract.
- **Agent evals:** a small set of saved sample contracts and questions, each with expected extracted fields and answers. Run on a schedule and whenever prompts change.
- **Each phase:** `aspire run` locally, Swagger at `/docs`, deploy, smoke test the production URLs, and a demo for you.
