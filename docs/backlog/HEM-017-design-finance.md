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

### 2026-11-27 · Designer (Haiku 5.5) · Review round 1 fixes (PR #26)
**Done** (one line per finding, in review order; spec sections in `docs/design/finance.md`, components in `web/src/components/ui/`)
- **B2 (currency error slot).** `AmountInput` takes `currencyError`. It shows under the whole amount row, at full width, and sets `aria-invalid` on the currency select, linked with `aria-describedby`. Spec 3.1 "Where errors show" and the 3.1.1 server row. 3.10 maps a server `currency` error there.
- **B3 (decimal mark).** Spec 3.1 "Parsing": only the locale's decimal mark is accepted. A thousands separator or the other mark gets "Enter an amount like 12.50." (3.1.1). Worked examples added in 3.1 (`1,250` in `en` is rejected, not read as 1.25).
- **B4 (contract form width and rows).** `AmountInput` is a full row in every form. The contract form uses `className="md:max-w-lg"` (`cn()` merges it over the default `md:max-w-md`). Other forms keep `max-w-md`. Only Starts and Ends, and Renews every and Notice period, share a row, from `md`. Spec 4.3 (dialog width, rows, new 768 wireframe), 10 table and 4.3 validation rows updated.
- **B5 (income sources at 768).** At 768 (648 px content) the table has three columns: Name (type and frequency as meta text under the name), Amount and Status. Type and How often are `from="xl"` columns. Spec 6.3 "Responsive", with a new 768 wireframe.
- **B6 (tests).** Not added in this ticket, by PM decision: the components have no logic and HEM-021 to HEM-023 cover them with Playwright. No tests were added here.
- **N1 (768 wireframes).** The earlier entry said each screen has 375, 768 and 1280 wireframes. That was not true. Each screen has 375 and 1280 wireframes. The 768 layouts are prose rules, plus two 768 wireframes for the screens that changed (contract form 4.3, income sources 6.3). This entry corrects the earlier wording.
- **N2 (draft notes).** Removed the "Hmm" paragraphs and the draft note under the income sources wireframe (6.3, 7.1).
- **N3 (irregular phrase).** `FREQUENCY_PHRASE.irregular` is empty, as in 3.5. Income sources show "typical amount" after the amount (6.3).
- **N4 (option order).** `CONTRACT_OPTIONS` starts with Weekly, as in 3.5.
- **N5 (empty state action).** Contracts empty state: the header "Add a contract" button is hidden, so the action appears once. Same rule as expenses (4.1).
- **N6 (currency truncation).** The closed currency select shows the ISO code only. The 9 rem column fits the code at every width (3.1, `CurrencyOption.label` is the code).
- **N7 (props lists).** 12.2 lists the required props of `AmountInput`, `CategorySelect`, `FrequencySelect`, `AppliesToSelect` and `ConvertedAmount` (`dateLabel`).
- **N8 (required).** `AmountInput` (`required`, on the amount input), `CategorySelect` and `FrequencySelect` take `required` and set `aria-required`. The native attribute is not used, and forms use `noValidate` (3.10). `AppliesToSelect` is optional and has no `required`.
- **N9 (optional).** "Applies to (optional)" in the contract form, the expense "More details", the income entry form and the source form (4.3, 5.2, 6.2, 6.3).
- **N10 (Textarea).** Spec 12.2 names HEM-021 as the owner of `web/src/components/ui/textarea.tsx`, and Board follow-ups list it.
- **N11 (upcoming rows).** Spec 7.1: below `xl` each event is a stacked card (type and date, name, amount, DueChip on its own line). At `xl` a fixed-column row. The phone and desktop wireframes are fixed.
- **N12 (long amounts).** Spec 3.2: amounts are `shrink-0 whitespace-nowrap`, and the title block is `min-w-0 flex-1`. Applied to the expense and income rows and the dashboard events.
- **N13 (shape).** PM decision Q12 in section 13. Records keep flat `amount` and `currency` (11.2, 11.4, 11.5, 11.6). Computed values use Money: the upcoming event `amount` (11.3), the dashboard totals and `upcoming` (11.7), and `base_amount` (11.4, 11.6). Each subsection states its shape.

**Left**
- B1 (gitleaks) is fixed on the HEM-020 branch, not here.
- Not changed, for the PM: `ConvertedAmount` (`web/src/components/ui/converted-amount.tsx`) renders a "No SEK to EUR rate" line when `converted` is null. Spec 3.3 and F3 say a null `base_amount` shows nothing under the amount. Either the component or the spec needs to change. I did not pick one.
- Not changed, for the PM: the contract list filter "Applies to" needs three options (All, Whole household, each member) (4.1). `AppliesToSelect` uses `""` for the whole household, so "All" needs a separate value. This is a spec and API-query question for HEM-021.

**How to verify**
- `docs/design/finance.md` sections 3.1, 4.3, 6.3, 7.1, 11 and 12.2.
- `npm --prefix web run lint` and `npm --prefix web run build` (both pass).

## Review
