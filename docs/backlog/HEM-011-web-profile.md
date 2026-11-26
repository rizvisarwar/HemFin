# HEM-011: Web, profile page

**Phase:** 1 · **Status:** In Review · **Owner:** Engineer · **Depends on:** HEM-009, HEM-010 (merged)

## Goal
A signed-in user can edit their profile and manage their addresses on `/profile`, and every amount in the app is shown in their base currency and locale.

## Acceptance criteria
- [ ] `/profile` built from the design system, mobile-first. Fields: display name; email (read-only, with a note on changing it); phone (country picker plus number, sent to the API which normalises to E.164, 422 shown inline on the field); base currency (searchable ISO-4217 select); locale. Save shows inline success and server validation errors; focus moves to the first invalid field; errors announced via `aria-live`.
- [ ] Addresses: list, add, edit, delete (confirmation dialog, a bottom sheet on phone), set default, API auto-default, 20-address cap (409 with a friendly message), empty state, cards on phone and a two-column grid on desktop.
- [ ] Form safety: `method="post"`, submit disabled until hydrated, uncontrolled inputs (nothing typed before hydration is lost, nothing in the URL), phone numbers and addresses never logged.
- [ ] Money formatting: wherever money is shown, use the profile's base currency and locale via `lib/format.ts`, exposed through a provider and hook for later phases.
- [ ] Danger zone placeholder: disabled "Delete account (coming soon)" with an explanation.
- [ ] Tests: unit tests for formatting and validation helpers; Playwright on phone, tablet and desktop against the extended mock backend (load, save, 422 phone, address add/edit/delete/set-default, 409 cap, no horizontal scroll, 44 px targets, before-JavaScript checks); `/profile` added to the dev regression; screenshot set for the Designer.

## Design notes
- Display name had no write path in the API, so `PATCH /me/profile` gained `display_name` (null clears) and the profile response returns it. It is stored on the user row, the same value `GET /me` returns.
- Profile and address inputs are uncontrolled and read from `FormData`. The searchable selects (`components/ui/combobox.tsx`) are ARIA comboboxes over an uncontrolled text input; the typed text is resolved to a code on submit.
- `FormatProvider` / `useFormat()` (`components/format-provider.tsx`) is mounted by the `(app)` layout from `GET /me/profile`; `MoneyText` defaults to it.

## Handoff log

### 2026-11-26 Engineer
**PR:** https://github.com/rizvisarwar/HemFin/pull/19 (CI green: api, web, docker, gitleaks).
**Done:** everything in the acceptance criteria. API: `display_name` on `PATCH/GET /me/profile` (+tests, client regenerated). Web: profile form, comboboxes, addresses, danger zone, `FormatProvider`/`useFormat`, mock backend endpoints, unit tests, Playwright (phone, tablet, desktop), dev regression covers `/profile`.
**Verify:** `cd web && npm test && npm run lint && npm run build && npx playwright test`, `npx playwright test -c playwright.dev.config.ts`. Screenshots: `web/test-results/screenshots/{phone,tablet,desktop}-profile-*.png`.
**Limitations and follow-ups:**
- "Text typed before hydration survives" is skipped on the WebKit phone project (WebKit hides streamed content until scripts load, so there is nothing to type into); it runs on tablet and desktop.
- Email change is not available; the note says so. Needs a flow (the `email_change` template exists).
- Phone country defaults to NL; derive it from locale later. Splitting a stored number uses a calling-code table, shared codes (+1, +7) resolve to US and RU.
- Locale list is a short curated set; the API accepts any BCP-47 tag.

### 2026-11-26 Engineer, Round 1 fixes (code review 7188921396, design review 7188655381, docs/design/profile.md)
Code, blocking:
1. Combobox Escape calls `stopPropagation()` when the list is open; test: first Escape closes the list and keeps the dialog and text, the second closes the dialog.
2. Set as default now has the accessible name "Set as default: {label}" (starts with the visible text, WCAG 2.5.3). This differs from the spec table in profile.md 5.2 ("Set {name} as default"); the spec should be updated.
Code, nits:
3. Phone country comes from the profile locale's region (`phoneDefaults`, no `navigator`); no region leaves it empty and requires a choice.
4. A stored number whose calling code is not in the table is shown whole in the number field and sent back unchanged (never null unless cleared); unit and Playwright tests.
5. Leading `00` is read as `+`. 6. `379` removed. 7. `aria-controls` only while the listbox exists; "No match" is a message outside the listbox; listboxes are named (Currencies, Countries, Phone countries). 8. `isKnownCurrency` removed. 9. Display name is counted in code points (the mock now does too). 10. API: control characters and line breaks rejected (tests); display name and profile saved in one transaction.
11. `fetchMe` and `fetchProfile` use React `cache()`; a test asserts one `GET /me` and one `GET /me/profile` per page load. 12. Phone project is 375 px wide (WebKit, iPhone 13 profile). 13. `waitForTimeout` replaced by waiting for the navigation.
Design: space badge removed from this page (`PageHeader` without `space`); "Saving…", "Deleting…" busy labels with `aria-busy`; money example follows the currency being picked; empty-state title is an h3 (`EmptyState titleAs`); Retry button on the load error; "Loading your profile" for screen readers; compact two-line address summary on phone; badge note added to design-system.md; nit 8 check added (country and currency lists fully visible and scrollable in the 375 px sheet): it passes, no fix needed.
Not mine: `CLAUDE.md` and `.claude/agents/*` show uncommitted changes in this worktree (the coordinator's process change); I did not commit them.
