# HEM-023: Dashboard summary (API and web)

**Phase:** 3 · **Status:** In Review · **Owner:** Engineer · **Depends on:** HEM-017, HEM-018, HEM-019, HEM-020

## Goal
`/dashboard` shows a real summary of the active space in the user's base currency.

## Acceptance criteria
- [ ] **`GET /api/v1/spaces/{space_id}/dashboard?month=YYYY-MM`** (`require_space_member()`, default month is the current UTC month) returns, in the caller's profile `base_currency`:
  - `spent_this_month`: expenses in the month.
  - `recurring_monthly`: active contracts normalised to a monthly amount (weekly x 52/12, quarterly / 3, and so on).
  - `income_this_month`: income entries in the month.
  - `upcoming`: the next 30 days of events from the HEM-018 schedule service, at most 10.
  - `unconverted_count`: the number of items left out because no FX rate existed.
- [ ] Response shape (HEM-017 Q2):
  - `month` (YYYY-MM) and `base_currency`.
  - `spent_this_month`, `recurring_monthly` and `income_this_month`, each as Money `{amount, currency}`.
  - `upcoming[]`, each with `date`, `type`, `contract_id`, `contract_name` and `amount` (Money).
  - `unconverted_count`.
- [ ] All aggregation is Decimal. Conversion goes through the HEM-020 FX service and rounds once per total.
- [ ] Tests:
  - Mixed currencies.
  - A missing rate is counted, not guessed.
  - Month boundaries.
  - Normalisation of each frequency.
  - Stranger gets 404.
- [ ] Regenerate the TS client.
- [ ] **Web:** replace the `/dashboard` placeholder with the cards and the upcoming list from the spec. Includes the first-run state and the "some amounts not converted" hint. Playwright at 375 and 1280.
- [ ] `pytest`, lint and build pass. The designer signs off on screenshots.

## Handoff log

### 2026-11-27 Engineer
Built `GET /api/v1/spaces/{space_id}/dashboard?month=YYYY-MM` and replaced the `/dashboard` placeholder. PR: see the PR for this branch (`HEM-023: Dashboard summary`).

**API**
- New module `modules/dashboard` (router, schemas, service). `require_space_member()`, so a stranger gets 404. Invalid `month` gets 422 (pattern `YYYY-MM`, years 1900 to 2099). Default month is the current UTC month from `get_today`.
- Conversion dates: expenses at `spent_on`, income at `received_on`, recurring contracts at the first day of the month, or today when that day is in the future (no rates exist for future dates). Documented in the service docstring.
- Rounding once per total: `convert_many` and `_apply` in `fx/service.py` got a keyword `round_results` (default True, so existing callers are unchanged). The dashboard sums unrounded values and quantizes the total once (ROUND_HALF_EVEN).
- Missing rate: the item is skipped and counted in `unconverted_count`.
- Recurring: weekly x 52/12, monthly x 1, quarterly /3, semiannual /6, annual /12; active contracts only.
- `upcoming`: reuses `contracts.service.upcoming` (30 days from today, at most 10). The event `amount` stays in the contract's own currency (a payment is made in that currency; no extra rate lookups). A notice deadline has `amount: null`, per spec 11.3.
- Tests: `api/tests/test_dashboard_db.py` (empty space, mixed currencies, month boundaries, missing rate, each frequency, cancelled excluded, round-once, caller's base currency, upcoming order and amounts, cap of 10, invalid month, stranger 404, no token 401).
- Client regenerated (`npm run gen:api`).

**Web**
- `/dashboard` is a server component using the active space from the cookie (same resolution as the shell) and `fetchDashboard` in `lib/api-server.ts`. Components in `components/dashboard/dashboard-view.tsx`, helpers and copy rules in `lib/dashboard/dashboard.ts` (unit tested). No money arithmetic in the browser.
- States: loading skeleton (Suspense), first run, populated, zero hints, empty upcoming, unconverted hint (singular and plural), error with Retry.
- Playwright `web/tests/dashboard.spec.ts` at phone 375, tablet 768 and desktop 1280: populated, first run, partial, unconverted, error and retry. Each checks no horizontal scroll and 44 px targets in `main`. Screenshots (light and dark) in `web/test-results/screenshots/hem023/<project>/`.
- Mock backend: `GET /spaces/{id}/dashboard` and `POST /__test/dashboard` (seed or fail); helper `seedDashboard` in `tests/support/auth.ts`.

**How to verify**: run the API tests against Postgres, then `npm --prefix web run lint`, `npm --prefix web test`, `npx playwright test tests/dashboard.spec.ts`. Open `/dashboard` with the mock backend seeded.

**Known limitations and follow-ups**
- First run is inferred from the response (all totals zero, no upcoming, nothing skipped), because the response has no "has records" flag. A user whose only records are in other months sees the first-run state. Follow-up: add a `has_records` flag to the API if that matters.
- The unconverted hint sits above the totals, not below them as in the spec sketch, so at 768 px "Income" and the upcoming card stay side by side.
- The provider name is not shown on an event (the API returns `contract_name` only).
- `calendarDate` is a local helper in `lib/dashboard/dashboard.ts`; swap it for the shared one in `lib/format` once HEM-021 (#30) merges. The contract name links to `/contracts/[id]`, which HEM-021 builds.
- The Playwright config and several specs hard-code port 3100. Another agent was using 3100 and 3199, so I ran with temporary port overrides and reverted them. Making the ports configurable in one place would help parallel agents.

## Review
