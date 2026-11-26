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

## Review
