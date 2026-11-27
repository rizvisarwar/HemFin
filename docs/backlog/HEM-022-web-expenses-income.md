# HEM-022: Web, expenses and income

**Phase:** 3 · **Status:** Todo · **Owner:** Engineer · **Depends on:** HEM-017, HEM-019, HEM-021 (shared form components)

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
