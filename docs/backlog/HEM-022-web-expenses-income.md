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

### 2026-11-27, Engineer, review round 1 fixes
Merged `origin/main` (HEM-023) with `git merge`, no conflicts.
- Code 1 (blocking): after any save or delete on expenses, entries and sources, focus goes to the list heading through the dialog's `finalFocus`, including the first add from an empty list. Tests added on all three screens.
- Code 2 (blocking): `useFormState.rebase()` moves the dirty baseline after "Save and add another". Test: Cancel closes at once, and a new amount is unsaved again.
- Design 1 (blocking): toast is now `z-40`, below dialogs (`z-50`), still 16 px above the phone bottom nav. Test: the delete confirm button is the top element at its centre while a toast is on screen.
- Design 2 (blocking): the contract chip is a label plus a separate remove button (`Remove filter: <name>`, 44 x 44). Playwright measures `getBoundingClientRect` at 375: Add an expense, Filters, chip and remove control are all at least 44 px. The existing controls were already 44 px (`h-11`); the screenshot estimates were off.
- Code 3: both tests assert `code == "invalid_member_filter"`.
- Code 4: `parse_member_filter` moved to `hemfin/core/filters.py`; contracts and expenses both import it.
- Code 5: skipped (PM decision).
- Code 6: spec section 9 now records that the dismiss outline uses `:focus` because script focus does not trigger `:focus-visible`.
- Code 7: spec 5.2 aligned to the code: Save and add another clears amount, description, merchant and contract link, keeps category, date, currency and Applies to.
- Code 8: follow-up (income Applies to filter needs an API filter on income entries).
- Code 9: space-switch tests added for income entries and sources.
- Code 10: spec section 9 and 3.10 say focus goes to the list heading after a save or delete.
- Code 11: `FetchPage` is now `(spaceId, cursor, filters)`, so `listSources(spaceId, cursor)` has no dummy parameter.
- Code 12: one `DESCRIPTION_MAX` in `lib/finance/common.ts`. Import styles stay as they are on purpose: `lib` files use relative `.ts` paths because the node test runner needs them, components use `@/`.
- Code 13, 14: skipped; recorded as follow-ups (empty title copy "No expenses this month" for a list that is not month-scoped, to raise with the Designer; `?contract_id=` read only at mount).
- Design 3: skipped (native date input format follows the browser locale). Design 4: "Clear filters" in the no-match states is now a text (ghost) button, on contracts, expenses and income.

Checks: lint, `npm --prefix web test` (130 pass), build, full Playwright (799 passed, 20 skipped), api ruff, format, mypy and pytest on throwaway Postgres 16 after `alembic upgrade head` (381 passed, 0 skipped), `gen-api --check` clean. Screenshots regenerated in `web/test-results/screenshots/hem022/`.

**Follow-ups:** income Applies to filter (API filter first); empty-state title copy; `?contract_id=` change while mounted.

## Review
Round 1: code review and design review both CHANGES_REQUESTED (blocking 1 and 2 each). Addressed in the entry above; awaiting re-review.
