# HEM-014: Design spec, households, invitations and switcher

**Phase:** 2 · **Status:** Todo · **Owner:** Designer · **Depends on:** none

## Goal
A written spec in `docs/design/households.md` (and any needed presentational components) so HEM-015 and HEM-016 can be built without a design round trip.

## Scope
- Household list and create flow.
- Household settings: rename, delete (typed-name confirmation), leave.
- Members: list, role change, remove, transfer ownership. Cards on phones, table from `md` up.
- Invitations: invite form (email, role), pending list with resend and revoke, status chips (pending, expired).
- Accept page `/invite` (token in the URL fragment): states for logged out (sign in or sign up, token kept), email mismatch, expired or invalid (one generic message), success, decline.
- Space switcher with real households: phone sheet with the SpaceBadge heading row (spec 4.2), long household names truncated safely, current space marked.
- Empty, loading and error states for each screen.

## Acceptance criteria
- [ ] Spec covers all of the above at 375, 768 and 1280 px, using the existing tokens and `docs/design/app-shell.md`.
- [ ] Tap targets 44 px, WCAG AA contrast, focus order, announced status changes, destructive actions confirmed.
- [ ] Wording rules: no mention of why an invitation failed beyond one generic message.
- [ ] Any new presentational components live in `web/src/components/ui` with no business logic.

## Handoff log

## Review
