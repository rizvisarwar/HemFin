# HEM-025: Design spec, in-app notifications

**Phase:** 5 · **Status:** In Review · **Owner:** Designer · **Depends on:** none

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

### 2026-11-27: Designer (Haiku 5.5)
**Done**
- `docs/design/notifications.md`: bell badge (rules, placements), centre at 375, 768 and 1280 px, row anatomy, read and unread (not colour-only), the four types with copy and icons, mark all, dismiss, show more, tap-to-open, empty, loading and error states, focus and announcements, microcopy, contrast, components and the API field list (HEM-026).
- `web/src/components/ui/count-badge.tsx`: `CountBadge` (presentational, `count`, `max` default 9, `aria-hidden`, renders nothing at 0). It is the only new component.
- `docs/design/app-shell.md`: the bell and rail badge now say `--primary` and "9+" (was `--destructive` and "99+"). The Notifications page shows the active space's badge.
- Checked: `npm --prefix web run lint` and `npm --prefix web run build` pass.

**Left (for HEM-027)**
- Swap the inline badges in `top-bar.tsx`, `bottom-nav.tsx` and `side-nav.tsx` for `CountBadge` (they still show "99+" in red).
- Build the centre, rows and dialogs from `notifications.md`.

**Decisions** (details in the spec, section 2)
- Titles are stable copy with no date (N5). The date goes on its own line.
- Dismiss has a confirmation (N8). Mark all does not.
- The list is for the active space only (N4).

**Open questions for the PM**
- Q1 (blocking for HEM-026): the example title "Home insurance renews on 1 jan. 2027" repeats the date. Please confirm titles are stable copy with no date.
- Q2: the ticket says "9+", the old shell said "99+" in red. This spec uses 9+ in primary. Confirm.
- Q3: keep the dismiss confirmation, or drop it?
- Q5: unread count excludes dismissed rows, and the page size is 20. Confirm in HEM-026.
- Q4: HEM-024 (sv-SE) is not on main yet. HEM-027 should use the shared helper once it lands.

**How to verify**
- Open `docs/design/notifications.md`, sections 3 to 5 and 14.
- `npm --prefix web run lint && npm --prefix web run build`.

## Review
