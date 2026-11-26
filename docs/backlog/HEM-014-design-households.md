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

### 2026-11-26 Designer
**Branch:** `hem-014-design-households`. **Files:** `docs/design/households.md` (new), `web/src/components/ui/status-chip.tsx` (new, presentational: `StatusChip` for invitation statuses, `RoleBadge` for owner, admin and member).
**Done:** spec covers the household list and create flow, household settings (rename, leave, typed-name delete), members (cards on phone, table from md, role change, remove, transfer ownership), invitations (form, pending list with resend and revoke, pending and expired chips), the `/invite` accept page (signed out, signed in, mismatch and invalid as one generic message, success, decline), the switcher with real households, and empty, loading and error states for each screen. Wireframes at 375 and 1280, tablet rules at 768. Contrast for the new token pairs is in section 5.3.
**Verify:** `npm run lint && npm run build` in `web/` pass. Read `docs/design/households.md` sections 2 (decisions) and 13 (open questions) first.
**Decisions for the engineer:**
- Routes `/household`, `/household/new`, `/household/[spaceId]/{members,invitations,settings}`, `/invite`. Section links are routes, not ARIA tabs.
- Mismatch, expired and invalid invitations share one generic message (the API returns the same 404). The accept page has no app shell.
- The switcher footer needs two links, and the phone sheet needs a heading row (`space-switcher.tsx` changes listed in section 5.4).
**Open for the PM (section 13):** repeat accept after success (idempotent or generic 404), previous owner's role after transfer (spec assumes admin), member and admin record permissions, delete cascade contents, and the exception that switching space on a household page opens the dashboard.
**Not done:** the Alert primitive (none exists; `FormMessage` is used), the `FormMessage` move to `ui/` (for HEM-015), and any screenshots (no screens built yet).

## Review
