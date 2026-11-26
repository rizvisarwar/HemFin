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
