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

## Review
