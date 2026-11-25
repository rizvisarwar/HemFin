# HEM-003: Next.js web shell

**Phase:** 0 · **Status:** In Review · **Owner:** Engineer · **Depends on:** HEM-002

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

### 2026-11-25 Engineer
Built `web/` (Next.js 16, App Router, TS strict, Tailwind v4, shadcn/ui, next-themes, Playwright). Tokens and `globals.css` taken from `docs/design/design-system.md`; layout components in `src/components/layout`, generic ones in `src/components/ui`, props per app-shell.md section 10. Landing `/`, `/sign-in` placeholder, `(app)` group with 11 placeholder pages. Landing footer has a server-side API status badge (offline when the API is unreachable). Active space is the `hemfin-space` cookie (server action); static placeholder spaces (Personal, Sample household).
- PR: see PR description (branch `hem-003-web-shell`).
- Verify: `cd web && npm install && npm run lint && npm run build && npx playwright test` (projects phone = WebKit iPhone 13, tablet 768, desktop 1280). Screenshots in `web/test-results/screenshots/` (gitignored).
- Deviations: dashboard is at `/dashboard` (not `/`) because `/` is the public landing page. shadcn "base-nova" style uses Base UI primitives, not Radix (current shadcn default). Added a `tablet` Playwright project (768) for the icon rail. "Continue with Google" is a plain outline button with no Google logo yet. Landing footer omits Privacy/Terms links (no pages yet). Preview panel on landing is a CSS mock.
- Follow-ups: real Google button and logo; Privacy/Terms pages; space-switch skeletons once data exists; Toast component not built (not in this ticket's list).

## Review

### Round 1 (2026-11-25)

**CHANGES_REQUESTED**

Checks run on PR #3 (branch `hem-003-web-shell`, head 640558d):
- `npm ci`: PASS (539 packages; npm reports 4 moderate audit advisories, not triaged here).
- `npm run lint`: PASS (no errors reported).
- `npm run build`: FAIL. Fourteen `Module not found` errors for `@/lib/utils`, `@/lib/env`, `@/lib/format`, `@/lib/space`.
- `npx playwright install chromium webkit`: PASS.
- `npx playwright test`: FAIL before any test ran. The `webServer` build step exits 1 for the same reason.

Findings:

1. **blocking**: the build fails on a clean checkout. Root `.gitignore:17` contains `lib/`, which matches any `lib` directory, including `web/src/lib/`. None of `web/src/lib/*` is tracked (`git ls-files web/src/lib` is empty), but about 20 components and pages import from it. Fix: anchor the rule to the repo root (`/lib/`, `/lib64/`) or add a `!web/src/lib/` exception, then commit the `web/src/lib/` files. Rerun `npm run build` and `npx playwright test`. I could not read these files, so the cookie helper, `API_URL` and `formatMoney` are unverified.

2. **blocking**: keyboard focus is not visible on the nav and space switcher. `outline-none` is applied at `web/src/components/layout/bottom-nav.tsx:25` (`slot`), `web/src/components/layout/side-nav.tsx:58` and `web/src/components/layout/space-switcher.tsx:57`. The global `:focus-visible` outline at `web/src/app/globals.css:91` sits in `@layer base`, and Tailwind utilities in `@layer utilities` win the cascade, so the utility removes the ring. This fails the checklist item "keyboard focus is visible" and CLAUDE.md rule 6 (WCAG AA). Fix: drop `outline-none` from these classes, or add `focus-visible:ring-2 focus-visible:ring-ring`. Add a Playwright check that a Tab-focused nav link has a visible outline.

3. **nit**: `web/src/app/actions.ts:13-17`. The `hemfin-space` cookie is set with `path: "/"`, `sameSite: "lax"` and a one-year `maxAge`. The value is a space id, not a secret, and nothing reads it from `document.cookie`. Consider adding `httpOnly: true` and `secure: process.env.NODE_ENV === "production"`.

4. **nit**: `web/src/components/ui/sheet.tsx:5` imports `cn` from the npm package `cn` (declared in `package.json`). Every other file uses `@/lib/utils`. The import works, but it is inconsistent and adds a dependency. Use the shared helper and drop the package.

5. **nit**: `web/tests/smoke.spec.ts:64-68`. The 44 px tap-target check covers only `bottomNav.getByRole("link")`. The More trigger is a button and is not checked. Extend the selector to links and buttons.

Checks passed by reading (not run):
- Landing health badge: `api-status.tsx` is an async server component with a 2 s timeout, `cache: "no-store"`, and a try/catch that returns "offline". It is wrapped in `Suspense` with a `checking` fallback (`app/page.tsx:114`). An unreachable API cannot break SSR.
- Secrets: `web/.env.example` has only `NEXT_PUBLIC_API_URL`, a placeholder. No server-side `process.env` use in `src/`. `web/.gitignore` ignores `.env*` and allows `.env.example`.
- Responsive: bottom nav is `md:hidden`, side nav is `hidden md:flex`, and the More sheet is a Base UI Dialog (built-in focus trap). Bottom slots are `min-h-16`, rail buttons are `size-12`, and other targets are `min-h-11`. Active items carry `aria-current="page"`.
- Labels: sign-in inputs use `Label htmlFor` and `autoComplete`. The logo has `aria-label`, and decorative icons are `aria-hidden`.
- Space switcher: phone uses a Sheet with a radiogroup, desktop uses a dropdown. The visible name sits inside the accessible name.

Accepted deviations (per PM): `/dashboard` route, base-nova (Base UI) primitives, tablet project, plain Google button.

Verdict: CHANGES_REQUESTED on findings 1 and 2. Once those are fixed, rerun `npm run lint && npm run build && npx playwright test` and check the three projects (phone, tablet, desktop) before approval.
