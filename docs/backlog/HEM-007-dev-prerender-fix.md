# HEM-007: Fix the dev-mode prerender error on the landing page

**Phase:** 0 (bug fix) · **Status:** In Progress · **Owner:** Engineer · **Depends on:** -

## Goal
`npm run dev` shows: `Route "/": Next.js encountered the unstable value Date.now() while prerendering`. The stack points at `<ApiStatus />` in `web/src/app/page.tsx:115`. Since HEM-004, `ApiStatus` calls the generated client, and `AbortSignal.timeout()` runs during prerender. With `cacheComponents: true`, request-time work has to come after a dynamic API.

## Acceptance criteria
- [ ] `ApiStatus` calls `await connection()` (from `next/server`) before any request-time work. Check `node_modules/next/dist/docs` for the current API.
- [ ] Look for the same pattern in the other server components and fix any you find.
- [ ] Regression check: a Playwright test (or a CI step) that starts `next dev`, loads `/` and at least one `(app)` route, and fails if the page shows the Next.js error overlay or the server logs a prerender or "blocking" error. It runs in the CI web job.
- [ ] `npm run lint`, `npm run build` and `npx playwright test` pass. `npm run dev` shows no error on `/`.

## Design notes

## Handoff log

## Review

### 2026-11-25 Engineer
- Cause: `ApiStatus` called `fetchApiStatus`, whose `AbortSignal.timeout()` reads the clock during prerender. With `cacheComponents: true` that is flagged unless request-time work follows a dynamic API.
- Fix: `await connection()` (from `next/server`) at the top of `ApiStatus` (`web/src/components/api-status.tsx`). It is already inside `<Suspense>` on the landing page. No other server component uses `Date.now`, `AbortSignal.timeout`, `Math.random` or `fetch`, so nothing else needed changing.
- Regression check: `web/playwright.dev.config.ts` + `web/tests-dev/` start `next dev` (log teed to `test-results/dev-server.log`), load `/` and `/dashboard`, and fail on the error overlay or on error lines in the server log. Verified it fails without the fix. New CI step "Playwright (next dev regression)" in the web job.
- Verify: `cd web && npx playwright test -c playwright.dev.config.ts`, or `npm run dev` and open `/`.
- Note: Next docs also describe `io()` (from `next/cache`) as the preferred option under Cache Components; the ticket specifies `connection()`, which is used. Possible follow-up.
