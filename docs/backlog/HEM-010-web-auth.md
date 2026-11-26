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

### 2026-11-26 Engineer (resumed, complete, PR opened)
**PR:** see the PR for `hem-010-web-auth` (title "HEM-010: Web auth flows", base `main`).

**Done**
- Playwright, reset password on phone (WebKit): root cause was not focus management. The test filled the controlled "New password" input before React had hydrated; hydration then reset it to "", so the password was the first invalid field and correctly got focus (the log showed `focusin` on `password`). Fixed in the tests with a `gotoHydrated` helper (waits for React to attach to the form) used for every form page; the component's `useFocusFirstInvalid` is unchanged because it was correct. Real-world note: a very fast typist on a slow phone can lose text typed before hydration; acceptable for now, follow-up below.
- Space switcher flake: the test now waits for `networkidle` (the `router.refresh()` RSC fetch) before `page.reload()`.
- Full Playwright suite (phone, tablet, desktop) run 3 times in a row: 73 passed, 2 skipped (phone-only test skipped on other projects), 0 failed, each time.
- `supabase/config.jsonc`: confirmations on, `/auth/callback` redirect URLs (localhost and 127.0.0.1), password policy 8 + `lower_upper_letters_digits`, Google stub (already present, disabled, `env(...)` client id and secret), four templates wired in.
- `supabase/templates/`: `confirmation`, `recovery`, `email_change`, `invite` (reserved), each `.html` (inline CSS, table layout, 480 px max, design-system colours as hex, no images or tracking, "expires in 1 hour", fallback plain link) and `.txt`.
- Env wiring: `web/.env.example`, root `.env.example`, `docker-compose.yml` (web service), Aspire AppHost (`supabase-url`, `supabase-anon-key` parameters, `SUPABASE_URL` for the API), README.
- `docs/deploy.md`: Auth URL configuration, auth settings and templates, Google Cloud OAuth client, Resend SMTP with SPF/DKIM/DMARC, Vercel env vars, checklist. Unverified items marked UNVERIFIED.
- `next dev` regression test now signs in through the mock backend and covers `/dashboard` and `/contracts` (checks the real personal space renders). `playwright.dev.config.ts` starts the mock.

**Verify:** `cd web && npx playwright test` (x3), `npx playwright test -c playwright.dev.config.ts`, `npm run lint`, `npm test`, `npm run build`; `dotnet build aspire/HemFin.AppHost`; `POSTGRES_PASSWORD=x docker compose config -q`.

**Known limitations and follow-ups**
- Not verified (no Docker for `supabase start`): real email links, PKCE across browsers, Google sign-in, the template rendering in real mail clients, `content_path` resolution by the Supabase CLI, `docker compose up` for the web service. The optional `SUPABASE_E2E=1` test was not written.
- The Google `enabled` flag cannot be driven by `env()` in the CLI config (only strings), so it is a manual flip; documented.
- Follow-up: preserve text typed into controlled inputs before hydration (for example by reading the DOM value on submit instead of state).
- Follow-up (Designer): review the auth screenshots in `web/test-results/screenshots/{phone,desktop}-auth-*.png`.

### 2026-11-26 Engineer, Round 1 fixes (code review 7186997907, design review 7186856513)
- **B1:** every auth form is `method="post"` and its submit button is disabled until hydrated (`useHydrated`). New Playwright tests block `/_next/static/**`, fill and `requestSubmit()` each server-rendered form (`/forgot-password`, `/reset-password`, `/check-email`) and assert no value in the URL. `/sign-in` and `/sign-up` are client-rendered (no form exists without JS); the test records that.
- **B2:** reset-password and sign-up passwords are uncontrolled (read from `FormData`). `PasswordRules` reads the input via `useSyncExternalStore` (re-read on mount, updated on `input`). New test holds the JS chunks, types, releases them and asserts the value and the checklist survive. `gotoHydrated` is removed: the disabled-until-hydrated button makes clicks wait on their own.
- **N1:** covered by B2 (sign-up). **N2:** covered by B1.
- **N3:** comments on `getSession()` in `lib/api.ts` and `lib/api-server.ts`.
- **N4:** `docs/deploy.md` says where the `.txt` templates go (nothing reads them; paste where a text body exists, UNVERIFIED that the dashboard has one); `config.jsonc` comment corrected.
- **N5:** callback test for `?code=bad`.
- **N6:** Google `skip_nonce_check` is `false`, with a comment.
- **D1:** Roboto Medium 500 via `next/font`, applied to the button only. I fetched Google's current guideline: it now names **Google Sans Medium, 14/20** (not Roboto) and a **10 px** logo-to-text gap on web (12 px is iOS). Google Sans is not freely licensed, so Roboto Medium is used and the gap is now 10 px; both are quoted in the code comment and `docs/design/auth-flows.md`. Deviation from the review text (which said 12 px); please confirm.
- **D2:** resend uses `aria-disabled` plus a handler guard (focus stays); a visible normal-colour sentence; a polite "You can send the email again now." when it ends (clock-driven test).
- **D3:** neutral check-email copy ("If you can sign up with {email}, we've sent a link to confirm it."), agreed in the new `docs/design/auth-flows.md`.
- **D4:** brand-panel rule documented in `docs/design/auth-flows.md`.
- **D5:** sign-in auth error marks both fields `aria-invalid` and `aria-describedby` the message.
- **D6:** screenshots take the pointer off the page first. The dimming was hover, not a disabled button.
- **D7:** polite password-rules summary ("2 of 4 password rules met."), one second after typing stops, only on change.
- **D8:** Button, Input and Badge use the global 2 px outline with 2 px offset from design-system 4.5 (translucent 3 px ring and focus border change removed); test asserts it.
- **D9:** forgot-password has the same cooldown pattern (shared `useCooldown` / `CooldownNote`).
- **D10:** email footer reworded, sender line with `{{ .SiteURL }}`.
- **D11:** expiry line 16 px in normal text colour; light-only noted in a comment in the templates and the design doc.
- **D12:** new screenshots: dark (sign-in, sign-up, forgot-password), reduced motion (sign-in; note the whole suite already runs with reduced motion on), sign-up success, sign-in wrong credentials.
- Also: the space-switcher smoke test still flaked on WebKit with `networkidle`, so `AppShellClient` now exposes `data-space-sync` (pending/idle, `display: contents` wrapper) and the test waits for `idle`. 12 repeats and 3 full runs pass.
- CI: the first round-1 push failed gitleaks on a dummy value typed by a new Playwright test (`generic-api-key` false positive). Renamed and changed the value; the one historic fingerprint is in `.gitleaksignore` (exact fingerprint, same approach as HEM-008). Run 45789405843: api, docker, gitleaks, web all pass.
- Checks: lint pass, unit 24/24, build pass, Playwright 3 full runs x 103 passed, dev config 1 passed.

## Review
