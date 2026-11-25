# HEM-003: Next.js web shell

**Phase:** 0 · **Status:** Todo · **Owner:** Engineer · **Depends on:** HEM-002

## Goal
Create `web/` Next.js app implementing the design system and responsive shell from HEM-002.

## Acceptance criteria
- [ ] Next.js (App Router, TS strict, ESLint), Tailwind, shadcn/ui initialised; tokens from `docs/design/design-system.md` as CSS variables, light/dark via `next-themes`.
- [ ] Components from the HEM-002 hand-off list in `src/components/layout` and `src/components/ui`; route group `(app)` with placeholder pages for each nav item showing the EmptyState; public landing page `/` and `/sign-in` placeholder.
- [ ] `NEXT_PUBLIC_API_URL` env; a tiny server-side status badge on the landing page calling `/health` (graceful when API down). `web/.env.example`.
- [ ] Playwright configured with projects `phone` (iPhone 13) and `desktop` (Desktop Chrome); smoke test navigates the shell, asserts no horizontal scroll (`scrollWidth <= clientWidth`) and bottom nav vs sidebar visibility per project; screenshots saved.
- [ ] `npm run lint`, `npm run build`, `npx playwright test` pass.

## Design notes

## Handoff log

## Review
