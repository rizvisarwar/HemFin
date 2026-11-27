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

### 2026-11-27 Engineer, review round 1
Merged origin/main (#30) and fixed every finding.
- Code 1: `recurring_monthly` now counts only active contracts with `start_date <= last day` and (auto-renew, or no end date, or `end_date >= first day`). Tests: ended excluded, auto-renew past end included, future start excluded, boundary days included.
- Code 2: test that a second space of the same user stays out of the first space's expenses, income and contracts.
- Code 3: `has_records` added to the response (any contract, expense or income entry in the space). First run uses it. Client regenerated. API test (empty, other-month expense, income alone, contract alone) and Playwright test (records only in another month is not first run).
- Code 4: first run in a household shows "Household members see only what the household shares." Playwright asserts it (and its absence in a personal space).
- Design 5: the empty-state "Add a contract" link is underlined (EmptyState secondary link) and 44 px; Playwright checks both.
- Design 6: the clamp is now on an inner span, not the inline-flex link; Playwright checks a very long name stays within two lines.
- Code nits 6, 8, 9: 422 test checks `application/problem+json`; income unconverted test; `void me` removed. Item 7: window documented in the route description (today through today + 30 days, 31 days inclusive).
- Design nits 3, 4: finance.md 7.1 state table and 7.3 now say the hint is above the totals and there is no provider. Nit 6: first-run actions side by side from `md` (EmptyState page variant). Nit 7: Income card uses `md:self-start xl:self-auto`.
- #30 merged: the local `calendarDate` is gone; events use `useFormat().calendarDate`. The view is now a client component.
- Screenshots regenerated under `web/test-results/screenshots/hem023/`.

## Review

### Round 1 (2026-11-27)
Reviewer: CHANGES_REQUESTED (code and design). Engineer fixes are in the Handoff log above; awaiting re-review.
