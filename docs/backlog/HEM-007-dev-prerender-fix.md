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
