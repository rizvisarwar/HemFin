# HEM-022: Web, expenses and income

**Phase:** 3 · **Status:** In Review · **Owner:** Engineer · **Depends on:** HEM-017, HEM-019, HEM-021 (shared form components)

## Goal
Replace the `/expenses` and `/income` placeholders with the screens from `docs/design/finance.md`.

## Acceptance criteria
- [ ] **Expenses:**
  - List grouped by month, with category and date-range filters and "Load more".
  - Phone-friendly quick-add.
  - Edit and delete, with confirmation.
  - An optional link to a contract.
- [ ] **Income:**
  - Sources list and form.
  - Entries list and form (optionally linked to a source).
  - Edit and delete.
- [ ] Uses the active space and the generated client. Server validation errors map to fields.
- [ ] Empty, loading and error states as the spec describes.
- [ ] Playwright at 375 and 1280: add, edit and delete an expense; add a source and an entry; no horizontal scroll; tap targets.
- [ ] Lint and build pass. The designer signs off on screenshots.

## Handoff log

## Review

### 2026-11-27, Engineer
**Done.** `/expenses`, `/income` (entries) and `/income/sources` replace the placeholders, following finance.md 3, 5, 6, 9, 10.
- Expenses: month groups (cards on phone, table from md), filters (From, To, Category, Applies to, `?contract_id=` chip), Show more, quick add with "Save and add another", last-used category (F19), edit, delete with confirmation, optional contract link.
- Income: Entries and Sources screens with section links, source form with Active checkbox, entry form with optional source ("(paused)" shown), edit and delete.
- Shared code generalised, contracts kept working: `lib/finance/{amount,common,problem,client}`, `usePagedList` (epoch guard), `useListHeading`, `FilterBar` and filter fields, `MonthGroups`, `useFormState`, `ReferenceGate`/`PendingFormDialog`, `ConfirmDialog` and `DiscardDialog` in `components/ui`, `SelectField`. The contracts list and form now use them.
- HEM-021 follow-ups: (a) heading focus only when focus is on body or null; (b) "Category unavailable" / "Member unavailable" when reference data fails; (c) AmountInput error replaces the hint; (d) tried `focus-visible`, which broke the programmatic-focus test (no ring on all 3 projects), so kept `focus:` as the shared `DISMISS_FOCUS_CLASS`.
- API change (small): the expenses list accepts `member_user_id=none` for the whole household, like contracts. Client regenerated.

**Verify.** `npm run lint`, `npm --prefix web test`, `npm run build`, `npx playwright test` (753 passed, 18 skipped). Screenshots: `web/test-results/screenshots/hem022/<phone|tablet|desktop>/`.

**Limits and follow-ups.**
- The API has no `member_user_id` filter on income entries, so the income Applies to filter (6.1) is not built. Follow-up: add it to the API, then the web filter.
- The new DB test assertion for `member_user_id=none` could not run locally (no DATABASE_URL); CI runs it.
- After a save or delete, focus goes to the list heading through the dialog's `finalFocus` (deterministic), not an effect.
- A month header says "N expenses so far" while more pages exist, since the browser does not total.
- Contracts specs still carry their own copies of the snap and layout helpers; `tests/support/ui.ts` could replace them.
- Month tables each size their own columns, so column positions differ slightly between months.
