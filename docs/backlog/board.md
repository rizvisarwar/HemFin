# HemFin Board

## Phases
Full scope of each phase: `docs/PROJECT_PLAN.md`, section 4.

| # | Phase | Status |
|---|---|---|
| 0 | Foundations & team setup | **Done** (HEM-001 to HEM-007). The first real deploy is waiting for the user's Supabase, Render and Vercel accounts (`docs/deploy.md`). |
| 1 | Auth & Profile | **In progress**: the Engineer (Sonnet 5.5) is implementing HEM-008 to HEM-011 (API auth and spaces, API profile, web auth, web profile) |
| 2 | Households & Invitations | Not started |
| 3 | Core Finance | Not started |
| 4 | Documents | Not started |
| 5 | Notifications | Not started |
| 6 | Reports & Forecast | Not started |
| 7 | Agent platform + Savings Agent | Not started |
| 8 | Contract Analysis Agent | Not started |
| 9 | Finance Assistant chat | Not started |
| 10 | Hardening & later items | Not started |

Deferred (not planned yet): native mobile app, WhatsApp notifications, push notifications.

## Phase 0 tickets
| Ticket | Title | Owner | Status | PR |
|---|---|---|---|---|
| HEM-001 | FastAPI API skeleton | Engineer | Done | #1 |
| HEM-002 | Design system and responsive app shell | Designer | Done | #2 |
| HEM-003 | Next.js web shell | Engineer | Done | #3 |
| HEM-004 | Generated TypeScript API client | Engineer | Done | #5 |
| HEM-005 | Local dev orchestration | Engineer | Done | #4 |
| HEM-006 | CI, scheduled jobs workflow and deployment config | Engineer | Done | #6 |
| HEM-007 | Fix the dev-mode prerender error on the landing page | Engineer | Done | #12 |

## Phase 1 tickets

| Ticket | Title | Owner | Status | PR |
|---|---|---|---|---|
| HEM-008 | API: Supabase JWT auth, users and personal space | Engineer | Done | #15 |
| HEM-009 | API: profile and addresses | Engineer | In Review | #17 (replaces #16) |
| HEM-010 | Web: auth flows | Engineer | In Progress | |
| HEM-011 | Web: profile page | Engineer | Todo | |

## Follow-ups (not yet ticketed)
- Phase 2 (space switcher with real households): the phone switcher sheet gets the SpaceBadge heading row from spec 4.2, and long household names stay readable (from the HEM-003 design review).
- Test hardening: assert the `hemfin-space` cookie attributes (httpOnly, sameSite, path) in the smoke tests (from the HEM-003 code review).
- Manual verification with Docker (from HEM-005): `supabase start`, `aspire run` (check that API traces reach the dashboard and which OTLP protocol Aspire injects), and `docker compose up --build`.
- Invitations ticket (Phase 2): keep invitation tokens out of URLs, or strip query strings from spans (from the HEM-005 review).
- CI hardening (from the HEM-006 Round 2 review): in `jobs-cron.yml`, retry only curl errors that happen before the request is sent (6, 7, 35), not 28, 52 or 56; give the `pg_isready` wait loops in `ci.yml` a limit of about 30 tries and print `docker logs pg` on failure; pass the CI Postgres password through an env file under `$RUNNER_TEMP` instead of `-e`; pin Docker images to digests.
- Faster web CI: drop the standalone web build step, because Playwright's webServer already builds the app.
- Dependency majors on hold: TypeScript 7.0 (Dependabot #8) needs its own ticket plus confirmation that Next.js 16 supports it. ESLint 10 (#11) waits for official `eslint-config-next` support. `@types/node` is held at the Node 22 runtime; bump it by hand with `.nvmrc`.
- API docs: the OpenAPI spec documents 422 responses as FastAPI's `HTTPValidationError`, but the API returns RFC 7807 problem+json. Document a shared problem schema for 4xx and 5xx responses app-wide (from the HEM-009 review).
