# HEM-017: Design spec, core finance (contracts, expenses, income, dashboard)

**Phase:** 3 · **Status:** In Review · **Owner:** Designer · **Depends on:** none

## Goal
A written spec in `docs/design/finance.md`, plus any presentational components, so HEM-021, HEM-022 and HEM-023 can be built without a design round trip.

## Scope
- **Shared building blocks:**
  - Money input: amount plus ISO-4217 currency. The currency defaults to the user's base currency. Use a decimal keyboard on phones, and handle locale decimal separators.
  - Money display: locale formatting, currency code or symbol, tabular numbers, negative and zero states.
  - Category picker, frequency picker, date fields, household-member picker ("applies to").
  - How a converted amount is shown next to the original, for example "≈ 1,234 SEK". It also needs a "no rate available" state.
- **Contracts:**
  - List (cards on phones, table from `md` up), filterable by category and status.
  - Detail view with the schedule: next payment, renewal date, notice deadline, and a "notice deadline soon" warning.
  - Create and edit form (sheet on phones, page or dialog on desktop). Cancel and delete need a confirmation.
- **Expenses:**
  - List grouped by month, filterable by category and date range.
  - Quick-add form, optimised for phones (a few taps).
  - Edit and delete.
- **Income:**
  - Income sources (salary, business, other; recurring, with a frequency).
  - Income entries (received payments).
  - Forms, list, edit and delete.
- **Dashboard (`/dashboard`):**
  - This month's spend.
  - Monthly recurring cost of contracts.
  - Income this month.
  - Upcoming payments and deadlines for the next 30 days.
  - Totals are in the user's base currency, with a hint when some amounts could not be converted.
  - A first-run state with no data.
- Empty, loading and error states for each screen.
- Personal vs household context: make clear which space the data belongs to, reusing SpaceBadge.

## Acceptance criteria
- [ ] The spec covers all of the above at 375, 768 and 1280 px, using the existing tokens and `docs/design/app-shell.md`.
- [ ] Tap targets are at least 44 px, and contrast meets WCAG AA.
- [ ] Focus order and form error handling are specified, including field-level server validation errors from problem+json.
- [ ] Destructive actions need a confirmation.
- [ ] The spec includes an API field list that the engineers can check against HEM-018 to HEM-020. Field names: see the design notes of HEM-018 and HEM-019.
- [ ] New presentational components (for example `MoneyText`, `AmountInput`, `DataTable`/`ResponsiveList` if still missing) live in `web/src/components/ui` and contain no business logic.

## Handoff log

### 2026-11-27 · Designer (Haiku 5.5)
**Done**
- `docs/design/finance.md`: spec for contracts (list, detail, form, cancel and delete), expenses (list, quick add, edit), income (entries, sources, forms), dashboard (populated, first run, errors). Each screen has 375, 768 and 1280 wireframes, states, copy and responsive rules. Section 11 lists every API field the UI uses, checked against HEM-018 to HEM-020 and HEM-023.
- Ten presentational components in `web/src/components/ui/`, props only: `amount-input`, `converted-amount`, `category-select`, `frequency-select` (also `FREQUENCY_LABEL`, `FREQUENCY_PHRASE`), `applies-to-select`, `due-chip`, `month-header`, `stat-card`, `form-section`, `checkbox-row`.
- `MoneyText`, `DataTable`, `ResponsiveList`, `ResponsiveDialog`, `EmptyState`, `SpaceBadge` and `Field` already exist and are reused, not rebuilt.
- `npm run lint` and `npm run build` in `web/` pass.

**Left**
- Nothing for design on this ticket. The spec needs the PM answers in section 13 (Q1 to Q11) before HEM-021 to HEM-023 start.
- The API tickets need these additions (see Q1, Q2, Q5): `base_amount` on expense and income responses, a `name` on categories, the upcoming event date field name, and the dashboard's money and currency shape.

**How to verify**
- Read `docs/design/finance.md` section 11 against HEM-018 to HEM-020 and HEM-023.
- `npm run lint && npm run build` in `web/` (run `npm install` from the repo root, because `web` is a workspace).
- Component list: `finance.md` section 12.2. No screen uses them yet, so there are no screenshots to review. Playwright checks start with HEM-021.

**Decisions (summary; full list F1 to F23 in the spec)**
- Forms are `ResponsiveDialog`s (sheet on phone, dialog from `md`), not pages (F7). Form field names equal API names, so server errors map straight to fields (F8).
- The browser never sums money. Month headers show a count, and a total only if the API sends one (F10). Dashboard totals come from HEM-023.
- Due chips: 7 days for payments and renewals, 30 days for notice deadlines (F6, Q3).
- Converted amounts use the code and minor units, "≈ SEK 1,234.00" (F21, Q8).
- "Mark as cancelled" replaces "Cancel" for contracts to avoid confusion with dismiss (F11).
- Income sources pause with an Active checkbox. Deleting one keeps its entries (F14).

**Open questions for the PM:** Q1 to Q11 in `finance.md` section 13. The most important are Q1 (converted amounts in list responses), Q5 (category names) and Q7 (contract form as a dialog on desktop).

**Notes**
- `npm install` rewrote one line of `package-lock.json` (npm version normalisation of `openapi-fetch`). It is reverted and not in this commit.
- No tests were added. The components are presentational and no screen uses them yet. Q11 proposes Playwright screenshots in HEM-021 to HEM-023.

### 2026-11-27 · Designer (Haiku 5.5) · PM decisions applied
**Done**
- `docs/design/finance.md`: section 13 is now "PM decisions" (Q1 to Q11, all answered). The decisions are applied to sections 2 (F3, F6, F7, F17, F21), 3.2, 3.3, 3.4, 3.6, 5.1, 5.2, 6.1, 6.2, 7.1, 9, 11, 12 and 14.
- Section 11 field list: `base_amount` is Money or null. Upcoming events have `date`, `type`, `contract_id`, `contract_name` and `amount` (Money). The dashboard has `month`, `base_currency`, Money totals, `upcoming[]` and `unconverted_count`. The `period` field is removed. Categories have `name`.
- Expense and income dates may be at most one day in the future (Q10).
- Contract form stays a dialog (Q7). `Field` and `FieldError` move to `components/ui/` in HEM-021 (Q6).

**Consequences to check**
- Money here means `{amount, currency}`. Records keep flat `amount` and `currency` because the forms post them flat. Money objects are used only for computed values. This is my reading of Q2, so confirm it, or say if records should move to Money too.
- List rows show no "no rate" note. A null `base_amount` hides the line, and the dashboard hint is the only place that says amounts are left out of the totals.
- The dashboard hint names the month ("November 2026") instead of a date range, because the response has `month` and no period.

**Left**
- Nothing for design on this ticket. HEM-021 starts with the `Field` move (Q6) and the Playwright screenshots (Q11).
- API tickets: HEM-018 (`name` on categories, upcoming event fields), HEM-019 (`base_amount` after HEM-020, one-day future limit), HEM-023 (dashboard fields).

**How to verify**
- `docs/design/finance.md` section 13 lists each decision and where it applies.
- Check section 11 against HEM-018, HEM-019 and HEM-023 once they are updated.

## Review
