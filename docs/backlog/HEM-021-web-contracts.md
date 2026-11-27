# HEM-021: Web, contracts

**Phase:** 3 · **Status:** In Review · **Owner:** Engineer · **Depends on:** HEM-017, HEM-018

## Goal
Replace the `/contracts` placeholder with the contracts list, detail and forms from `docs/design/finance.md`, in the active space.

## Acceptance criteria
- [x] List with filters (category, status). Cards on phones, table from `md` up. Cursor-paginated "Load more".
- [x] Detail view showing the schedule (next payment, renewal, notice deadline) and the "notice deadline soon" warning, as the spec describes.
- [x] Create and edit form using the shared money input, category, frequency and member pickers. Server validation errors map to fields. Cancel and delete need a confirmation.
- [x] Data always comes from the active space (the `hemfin-space` cookie). Switching space reloads the data. Every call goes through the generated API client.
- [x] Empty, loading and error states as the spec describes.
- [x] Playwright: phone (375) and desktop (1280) for list, create, edit and delete, plus a no-horizontal-scroll check and 44 px tap targets. Use the existing mock backend.
- [x] The "Applies to" list filter has three options: All, Whole household, and each member (spec 4.1). Agree its query values with the HEM-018 API (`member_user_id` filter). If the API has no "whole household" (member is null) filter, add one.
- [x] Add the `Textarea` primitive in `web/src/components/ui/textarea.tsx`, for Notes.
- [x] Move `Field` and `FieldError` to `web/src/components/ui` (HEM-017 Q6).
- [x] Attach Playwright screenshots at 375, 768 and 1280 to the PR (HEM-017 Q11).
- [x] `npm run lint && npm run build` pass. The designer signs off on screenshots.

## Handoff log

### 2026-11-27, Engineer
**Done.** Contracts list (`/contracts`), detail (`/contracts/[id]`) and the create/edit dialog, all client-driven from the generated API client in the active space (views are keyed by the space id, so a switch reloads; the detail page leaves for the list). Cursor "Show more contracts", filters (Status, Category with "All <group>" options, Applies to: All, Whole household, member), empty/loading/error states, mark as cancelled, make active again, delete with confirmations, unsaved-changes alert. Server errors map to fields by API name; a coded 422 (`invalid_category`, `invalid_member`) maps to its field. Amounts are parsed as text (`lib/contracts/amount.ts`, never Number/parseFloat) and sent as strings.
**API change.** `GET /contracts?member_user_id=none` returns whole-household contracts (invalid text gives a 422). Client regenerated. DB test extended (not run locally: no Postgres here, CI runs it); a pure unit test covers the parser.
**Shared changes.** `Field`/`FieldError` moved to `components/ui/field.tsx` (imports updated), new `ui/textarea.tsx`, `calendarDate` formatter (UTC, so a date never moves a day), breadcrumb links in `PageHeader` are now 44 px tall.
**Verify.** `npm --prefix web run lint`, `npm --prefix web test`, `npm --prefix web run build`, `cd web && npx playwright test` (596 passed, 16 skipped). Screenshots (light and dark, 375/768/1280): `web/test-results/screenshots/hem021/<phone|tablet|desktop>/`.
**Limits and follow-ups.** The category column label uses the category name (e.g. "Car insurance"), not the spec sketch "Insurance, car". The mock backend does not compute schedules (tests seed them). The three pickers still repeat the error markup instead of using `FieldError`. Designer sign-off on screenshots is pending.

### 2026-11-27, Engineer, review round 1
Merged origin/main (HEM-019, no conflicts); `npm run gen:api` produced no diff.
Code review:
1. loadMore race: an epoch counter is bumped on every filter change or reload; a page requested earlier is dropped, `moreBusy` is reset in `applyFilters`. Test: held cursor request, Status changed, then released (`contracts-review.spec.ts`).
2. Detail after a space switch: renders the skeleton when `space.id !== spaceId`. Test: a MutationObserver proves the old heading never shows once the space is Personal.
3. Delete focus: the detail page goes to `/contracts?deleted=1`; the list focuses "Your contracts" once loaded and clears the param. Test: `toBeFocused`.
N1/N2: "For <member>" and the category name show nothing until the reference data is ready (list and detail). Test with a delayed members call.
N3: polite `role=status` live region announces "N contracts shown". Test.
N4: detail is `md:max-w-[640px]`.
N5: the confirm button stays busy after success (no second DELETE).
N6: `AmountInput` has an `onBlur` prop; the wrapper div is gone.
N7: notes wrapper cleaned up.
N8: the three pickers and `AmountInput` use `FieldError`.
N9: DB test adds a second space with a whole-household contract and asserts `member_user_id=none` does not return it (not run locally: the Docker daemon is not running here; CI runs it).
Design review:
4. Dates are day, month, year ("1 Jan 2027") through `calendarDate` (parts of Intl.DateTimeFormat, UTC); used by cards, table and schedule. Test.
5. SpaceBadge moved into the dialog header (new `headerExtra` prop on `ResponsiveDialog`), at every width. Test.
6. After a failed submit the first invalid field is focused and its message is scrolled into view in the scrolling body (the footer sits outside it). Test: the currency error ends above the footer and is fully in the viewport.
Nits: 4 sketch in finance.md 4.1 and 4.2 now says "Car insurance". 5 form Cancel is a text (ghost) button. 6 a cancelled contract with a notice period shows "No notice deadline, cancelled". 8 the close icon is 44 px (tested). 9 the dismiss buttons of the confirmations and the discard alert get an explicit `focus:` outline, since programmatic focus after a click is not :focus-visible (tested via computed outline). 10 description is `text-balance`. 11 not done (not trivial). 7 skipped as agreed.
Verify: lint, `npm test` (97), build, `npx playwright test` (617 passed, 16 skipped), ruff and mypy. Screenshots regenerated in `web/test-results/screenshots/hem021/<phone|tablet|desktop>/`.

## Review

### Round 1 (2026-11-27)
Reviewer and Designer: CHANGES_REQUESTED (PR comments 7217166981 and 7216992997). Fixed in the next commit, see the Handoff log entry above.
