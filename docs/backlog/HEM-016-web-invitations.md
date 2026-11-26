# HEM-016: Web, invitations and accept page

**Phase:** 2 · **Status:** Todo · **Owner:** Engineer · **Depends on:** HEM-013, HEM-014, HEM-015 · **PM security review required**

## Goal
Admins send and manage invitations; invitees accept or decline through the web app, including when they are logged out or new.

## Acceptance criteria
- [ ] Prerequisite (from the HEM-015 design review): build the shared `DataTable` and `ResponsiveList` components in `web/src/components/ui/` (spec `households.md` 5.1), use them for the invitations table, and move the HEM-015 members table onto them.
- [ ] Invite form, pending list, resend and revoke, per the spec.
- [ ] `/invite` reads the token from the URL **fragment**, immediately moves it into `sessionStorage` (or memory) and clears the fragment from the address bar; it is never put in a query string, a log, a `Referer`, or analytics. Page sets `Referrer-Policy: no-referrer`.
- [ ] Logged out: the user chooses sign in or sign up and, after auth (including email verification and the PKCE callback), returns to `/invite` with the token kept. Sign up pre-fills nothing from the token.
- [ ] Logged in: preview shows household and inviter; Accept and Decline call the API with the token in the body. A mismatch, expiry or invalid token all show the same generic message with a path forward (sign in with the invited address).
- [ ] After accept, the new household becomes the selected space.
- [ ] After a successful accept, the page clears the token, stores the tab-only joined marker (household id and name, no token), and navigates to the household. A reload of `/invite` in that tab shows the joined state from the marker, never the generic message (`docs/design/households.md` 6.8 K).
- [ ] Sign-out clears the `sessionStorage` joined marker (`docs/design/households.md` 6.8 K, point 5), so the next user of the browser never sees another user's "You joined" message.
- [ ] Create and resend can return **503 `email_not_sent`** after the invitation was saved (HEM-013). Show calm copy: "We saved the invitation but couldn't send the email. Try Resend in a moment." The row then appears in the pending list with Resend available. Agree the exact copy with the Designer in `households.md` 6.4 (from the HEM-013 review, N11).
- [ ] Playwright covers: new user, existing user, wrong account, expired, decline; phone and desktop screenshots.
- [ ] `npm run lint && npm run build` pass.

## Handoff log

### 2026-11-26, Engineer (Sonnet 5.5)
**Done.** Branch `hem-016-web-invitations`. PR: https://github.com/rizvisarwar/HemFin/pull/24
CI follow-up: gitleaks flagged three made-up token-shaped test values; they were replaced by run-time-built values and the three historic fingerprints are in `.gitleaksignore`. A navigation race in `invitations-screens.spec.ts` was fixed.
- Shared `DataTable` and `ResponsiveList` in `web/src/components/ui/`; the invitations list and the HEM-015 members table both use them.
- Admin side: `components/invitations/invitations-view.tsx` (invite form, list with status chips, resend with a live `Retry-After` countdown, revoke dialog, Show more). 409 `already_member` / `already_invited`, 429, 503 `email_not_sent` (row appears, Resend available) and 503 unconfigured are mapped to spec copy. The `email_not_sent` copy is now in `households.md` 6.4.
- `/invite`: `components/invitations/invite-flow.tsx`. Token from the fragment only, moved to sessionStorage, fragment stripped with `history.replaceState`; `Referrer-Policy: no-referrer` and `Cache-Control: no-store` for `/invite` in `next.config.ts`. States A to K. Joined marker is keyed by user id; sign-out clears it.
- Small API change: CORS now exposes `Retry-After` (browsers hide it otherwise, so the countdown could not work against the real API). Test added in `api/tests/test_api.py`.
- Mock backend has the invitation endpoints and test helpers; Playwright specs `invitations.spec.ts` and `invitations-screens.spec.ts`; dev regression extended.

**Verify.** `cd web && npm run lint && npm test && npm run build && npx playwright test` (twice), `npx playwright test -c playwright.dev.config.ts`. Screenshots: `web/test-results/screenshots/hem016/<phone|tablet|desktop>/`.

**Limitations and follow-ups.**
- Email confirmation for a brand-new user usually opens in another tab, where sessionStorage is empty, so the invitee lands on the generic state and has to click the email link again (it still works until accepted). Keeping the token across tabs would need localStorage, which the spec rules out; PM decision if wanted.
- "Sign out" on `/invite` keeps the invitation token (and stays on the page) so a wrong-account user can sign in with the right address; every other sign-out clears everything. The token is useless to anyone except the invited address.
- Deviations from the spec: the md+ table has Email (role and date under it), Status and Actions at all widths (no separate Role/Date columns at 1280 px, the table is too narrow beside the form); the checking state shows a real h1 "Checking your invitation" instead of a skeleton title.
- API tests (`uv`) could not be run in this environment; CI covers them.
- The `Button render={<Link/>}` pattern gives role=button; the accept page uses real links with `buttonVariants` instead.

## Review

### 2026-11-26, Engineer: design review round 1 (PR comment 7204725194)
1. Per-row polite live region (`RowLive`, always in the DOM) announces the wait once at its start ("You can resend in N seconds."), once at its end ("You can resend now."), and each resend success or failure. The visible countdown is a plain paragraph, not a live region.
2. Held-off Resend has `aria-describedby` pointing at the visible wait text (ids carry the list/table layout). Playwright asserts the live region, the once-only announcement, the describedby target, and the daily-cap case.
3. State H: "If you were invited at a different email address, sign out, then sign in with that address." when signed in; "...sign in with that address." when signed out (no sign-out text, only "Sign in"). `households.md` 6.8 H and 8.2 updated. Tested.
4. The countdown and daily-cap text use the warning tokens, not error red.
5. Email cells have `invitation-email-list` and `invitation-email-table` test ids; tests updated.
6. Members phone buttons were only dimmed because the screenshot was taken before hydration (disabled until hydrated). Screenshots now wait for that; Playwright asserts Change role is enabled and its text contrast is at least 4.5:1.
7. The accept-page h1 shows a focus outline when focused programmatically (tested), instead of `outline-none`.
Known limitation (unchanged): confirming email for a new account in another tab loses the token (sessionStorage is per tab); the user clicks the email link again.
