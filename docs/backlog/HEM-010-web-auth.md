# HEM-010: Web, auth flows

**Phase:** 1 · **Status:** In Progress (WIP, no PR yet) · **Owner:** Engineer · **Depends on:** HEM-008 (merged), HEM-009 (merged) · **Security-sensitive:** yes (PM does the extra security review)

## Goal
Users can sign up, confirm their email, sign in (password or Google), reset a password and sign out. (app) routes are protected, and the app shell shows the user's real personal space.

## Acceptance criteria
- [ ] `@supabase/ssr` browser and server clients. Env: `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY` (public by design). No server secrets in the web app.
- [ ] Pages: sign in, sign up (inline password rules, "Continue with Google" via `signInWithOAuth`, a button that follows Google's branding guidelines), "Check your email" (resend with cooldown), auth callback (PKCE code exchange), forgot password, reset password, sign out.
- [ ] Error copy never reveals whether an email address exists.
- [ ] Route protection: (app) routes redirect signed-out users to `/sign-in?next=...`; `next` is a sanitised same-origin relative path; signed-in users on auth pages go to `/dashboard`. Uses this Next.js version's proxy convention (`src/proxy.ts`).
- [ ] The API client sends the access token. After sign-in the shell calls `GET /api/v1/me`; the space switcher shows the real personal space and the household placeholder is gone.
- [ ] `supabase/config.jsonc`: email confirmations on, localhost redirect URLs, Google provider driven by env, password policy.
- [ ] Branded HTML and plain-text auth email templates in `supabase/templates/` (confirm sign-up, reset password, email change), mobile-friendly, inline CSS, no tracking, wired into the local config.
- [ ] `docs/deploy.md` updated: Supabase Auth URL configuration, Google Cloud OAuth client (origins and redirect URI), Resend custom SMTP (sender domain, SPF, DKIM, key stored as a secret), Vercel env vars. Anything unverified marked UNVERIFIED.
- [ ] Design system followed: mobile-first, 44 px tap targets, focus on the first invalid field, errors announced via `aria-live`.
- [ ] Tests: unit tests for the `next` sanitiser and the error mapping; Playwright for the signed-out redirect and form validation on phone and desktop; optional end-to-end test against local Supabase gated by `SUPABASE_E2E=1`.

## Design notes
- The proxy (`src/proxy.ts`) refreshes the Supabase session and does an optimistic redirect check with `getClaims()` (signature verified against the project JWKS). The API remains the real authorization gate.
- Playwright uses `web/tests/support/mock-backend.mjs`, a separate process that stands in for Supabase Auth and the API (the Next server calls the API server-side, so `page.route` cannot mock it). Its ES256 key is generated in memory at startup, so no key material is in the repo. `tests/support/auth.ts` mints a token from it and sets the `sb-127-auth-token` cookie.
- The pending email for "Check your email" is kept in `sessionStorage`, not in the URL.

## Handoff log

### 2026-11-25 Engineer (end of day, WIP)
**Done (committed on `hem-010-web-auth`, not yet a PR, CI has not run on this branch):**
- Supabase clients (`lib/supabase/{env,client,server}.ts`), `src/proxy.ts` (session refresh, `/sign-in?next=` redirect, signed-in users leave auth pages), `lib/routes.ts`.
- `lib/auth/`: `next-path.ts` (sanitiser), `errors.ts` (non-enumerating error mapping), `password.ts`, `pending.ts`, with 24 unit tests (`npm test`, all pass).
- Pages and forms: `/sign-in`, `/sign-up`, `/check-email`, `/forgot-password`, `/reset-password`, `/auth/callback` (route handler), sign-out server action plus a Sign out button in the top bar. Google button follows the branding guidelines.
- (app) layout now calls `GET /api/v1/me` (server side) and renders the real spaces; the placeholder household is removed (`lib/space.ts`, `app/actions.ts` validates the space id against the user's spaces). `await connection()` added in the layout (HEM-007 pattern).
- Playwright: mock backend, `tests/auth.spec.ts`, `tests/smoke.spec.ts` updated to sign in through the mock. Local run on phone + desktop: all pass except the item below.
- `npm run lint`, `npx tsc --noEmit`, `npm run build` pass locally.

**Known failing or flaky:**
- `auth.spec.ts` "reset password page checks both passwords" fails on the `phone` (WebKit) project 3 of 3 runs: after submitting mismatched passwords, `Confirm new password` is not focused (passes on desktop). Suspect the `useFocusFirstInvalid` effect or WebKit focus after a button tap on that page; the same helper works on the other forms. Investigate with the trace.
- `smoke.spec.ts` "space switcher changes the active space" failed once on phone with "Frame load interrupted" at `page.reload()` (passed on re-run): the space-change server action triggers `router.refresh()` while the test reloads. Wait for the refresh (for example poll the cookie, then `waitForLoadState`) before reloading.

**Not started (do these next, in order):**
1. Fix the two Playwright items above; run `npx playwright test` fully (phone, tablet, desktop).
2. `supabase/config.jsonc`: `enable_confirmations: true`, `additional_redirect_urls` incl. `http://127.0.0.1:3000/auth/callback` and `http://localhost:3000/auth/callback`, Google `enabled` driven by env, `minimum_password_length: 8`, `password_requirements: "lower_upper_letters_digits"`, `[auth.email.template.*]` entries pointing at the new templates.
3. `supabase/templates/`: `confirmation.html/.txt`, `recovery.html/.txt`, `email_change.html/.txt` (inline CSS, mobile-friendly, no tracking pixels, `{{ .ConfirmationURL }}`), and wire them in the config.
4. `web/.env.example`: add `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY` (local values come from `supabase status`; the API's `SUPABASE_URL` must use the same host).
5. `docs/deploy.md`: Supabase Auth URL configuration, Google Cloud OAuth client, Resend SMTP (domain, SPF, DKIM, key as a secret), Vercel env vars; mark unverified items UNVERIFIED. Update README local-dev notes. Also `aspire/HemFin.AppHost` and `docker-compose.yml` should pass the new web env vars if they start the web.
6. `playwright.dev.config.ts` / `tests-dev`: `/dashboard` now redirects to `/sign-in` without a session; the dev regression still loads it (fine), but consider adding the Supabase env vars and the mock so a signed-in (app) route is covered under `next dev`.
7. Optional `tests/e2e-supabase.spec.ts` gated by `SUPABASE_E2E=1` (needs Docker: sign up, read the mail from the local mail catcher on port 54324, confirm, land on the dashboard).
8. Merge `origin/main` if it moved, push, open the PR with `--base main` (title `HEM-010: Web, auth flows`), wait for CI (`gh run watch`), then report to the PM.

**Notes:**
- The branch history contains a commit named "WIP HEM-010 web auth (local only)" from before the first push; it cannot be rewritten without a force-push.
- Local verification of real Supabase behaviour (email links, Google, PKCE across browsers) is UNVERIFIED: Docker is not available here.

## Review
