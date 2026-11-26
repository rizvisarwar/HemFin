# HEM-016: Web, invitations and accept page

**Phase:** 2 · **Status:** Todo · **Owner:** Engineer · **Depends on:** HEM-013, HEM-014, HEM-015 · **PM security review required**

## Goal
Admins send and manage invitations; invitees accept or decline through the web app, including when they are logged out or new.

## Acceptance criteria
- [ ] Invite form, pending list, resend and revoke, per the spec.
- [ ] `/invite` reads the token from the URL **fragment**, immediately moves it into `sessionStorage` (or memory) and clears the fragment from the address bar; it is never put in a query string, a log, a `Referer`, or analytics. Page sets `Referrer-Policy: no-referrer`.
- [ ] Logged out: the user chooses sign in or sign up and, after auth (including email verification and the PKCE callback), returns to `/invite` with the token kept. Sign up pre-fills nothing from the token.
- [ ] Logged in: preview shows household and inviter; Accept and Decline call the API with the token in the body. A mismatch, expiry or invalid token all show the same generic message with a path forward (sign in with the invited address).
- [ ] After accept, the new household becomes the selected space.
- [ ] Playwright covers: new user, existing user, wrong account, expired, decline; phone and desktop screenshots.
- [ ] `npm run lint && npm run build` pass.

## Handoff log

## Review
