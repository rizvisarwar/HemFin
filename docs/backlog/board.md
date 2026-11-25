# HemFin Board

| Ticket | Title | Owner | Status | PR |
|---|---|---|---|---|
| HEM-001 | FastAPI API skeleton | Engineer | Done | #1 |
| HEM-002 | Design system and responsive app shell | Designer | Done | #2 |
| HEM-003 | Next.js web shell | Engineer | Done | #3 |
| HEM-004 | Generated TypeScript API client | Engineer | Done | #5 |
| HEM-005 | Local dev orchestration | Engineer | Done | #4 |
| HEM-006 | CI, scheduled jobs workflow and deployment config | Engineer | Done | #6 |
| HEM-007 | Fix the dev-mode prerender error on the landing page | Engineer | In Progress | |

## Follow-ups (not yet ticketed)
- Phase 2 (space switcher with real households): the phone switcher sheet gets the SpaceBadge heading row from spec 4.2, and long household names stay readable (from the HEM-003 design review).
- Test hardening: assert the `hemfin-space` cookie attributes (httpOnly, sameSite, path) in the smoke tests (from the HEM-003 code review).
- Manual verification with Docker (from HEM-005): `supabase start`, `aspire run` (check that API traces reach the dashboard and which OTLP protocol Aspire injects), and `docker compose up --build`.
- Invitations ticket (Phase 2): keep invitation tokens out of URLs, or strip query strings from spans (from the HEM-005 review).
- CI hardening (from the HEM-006 Round 2 review): in `jobs-cron.yml`, retry only curl errors that happen before the request is sent (6, 7, 35), not 28, 52 or 56; give the `pg_isready` wait loops in `ci.yml` a limit of about 30 tries and print `docker logs pg` on failure; pass the CI Postgres password through an env file under `$RUNNER_TEMP` instead of `-e`; pin Docker images to digests.
- Faster web CI: drop the standalone web build step, because Playwright's webServer already builds the app.
