# HEM-025: Design spec, in-app notifications

**Phase:** 5 · **Status:** Design · **Owner:** Designer · **Depends on:** none

## Goal
A short spec in `docs/design/notifications.md`, plus any presentational components, so HEM-027 can be built without a design round trip.

## Scope (POC: in-app only, no email, no preferences screen)
- **Bell in the top bar** (it already exists in `top-bar.tsx`, phone and desktop): unread count badge (cap at "9+"), accessible name ("Notifications, 3 unread"). Tapping opens `/notifications`; no popover.
- **Notification centre `/notifications`:**
  - List, newest first, for the active space.
  - Each row: icon by type, title (for example "Home insurance renews in 7 days"), the date of the event ("1 jan. 2027"), how long ago it was created, and an unread marker.
  - Tapping a row marks it read and opens the contract.
  - Actions: "Mark all as read" and dismiss one row.
  - Empty, loading and error states.
- **Types and copy:** payment due, renewal coming, notice deadline coming, contract ending.
- Uses the existing tokens, `docs/design/app-shell.md` and the sv-SE date and amount format (HEM-024).

## Acceptance criteria
- [ ] The spec covers the above at 375, 768 and 1280 px, with copy for each notification type.
- [ ] Tap targets are at least 44 px, and contrast meets WCAG AA. The unread state isn't shown by colour alone. Count changes are announced politely.
- [ ] The spec includes the API field list (see HEM-026).
- [ ] New presentational components (if any) live in `web/src/components/ui` and contain no business logic.

## Handoff log

## Review
