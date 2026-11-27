# HEM-027: Web, notification bell and centre

**Phase:** 5 · **Status:** Todo · **Owner:** Engineer · **Depends on:** HEM-025, HEM-026

## Goal
Replace the `/notifications` placeholder and wire the top-bar bell, as `docs/design/notifications.md` describes, for the active space.

## Acceptance criteria
- [ ] The bell shows the unread count for the active space. It refreshes on navigation and when the space changes, with no polling loop faster than 60 s. Its accessible name includes the count.
- [ ] `/notifications` lists notifications with cursor "Load more". Tapping a row marks it read and opens the contract. It has "Mark all as read", dismiss per row, and empty, loading and error states as the spec describes.
- [ ] Data comes from the active space through the generated client. Switching space reloads it, and nothing from another space flashes.
- [ ] Playwright at 375, 768 and 1280: list, mark read, mark all read, dismiss, the badge count updating, empty and error states, no horizontal scroll and 44 px tap targets. Screenshots go under `web/test-results/screenshots/hem027/`.
- [ ] Lint, unit tests and build pass. The designer signs off on screenshots.

## Handoff log

## Review
