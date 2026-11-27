# HEM-023: Dashboard summary (API and web)

**Phase:** 3 · **Status:** Todo · **Owner:** Engineer · **Depends on:** HEM-017, HEM-018, HEM-019, HEM-020

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

## Review
