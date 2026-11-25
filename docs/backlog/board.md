# HemFin Board

| Ticket | Title | Owner | Status | PR |
|---|---|---|---|---|
| HEM-001 | FastAPI API skeleton | Engineer | Done | #1 |
| HEM-002 | Design system and responsive app shell | Designer | Done | #2 |
| HEM-003 | Next.js web shell | Engineer | Done | #3 |
| HEM-004 | Generated TypeScript API client | Engineer | In Progress | |
| HEM-005 | Local dev orchestration | Engineer | In Progress | |
| HEM-006 | CI, scheduled jobs workflow and deployment config | Engineer | Todo | |

## Follow-ups (not yet ticketed)
- Phase 2 (space switcher with real households): the phone switcher sheet gets the SpaceBadge heading row from spec 4.2, and long household names stay readable (from the HEM-003 design review).
- Test hardening: assert the `hemfin-space` cookie attributes (httpOnly, sameSite, path) in the smoke tests (from the HEM-003 code review).
