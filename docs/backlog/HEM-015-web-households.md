# HEM-015: Web, households, members and switcher

**Phase:** 2 · **Status:** Todo · **Owner:** Engineer · **Depends on:** HEM-012, HEM-014

## Goal
Users create and manage households in the web app and switch between spaces.

## Acceptance criteria
- [ ] Household list, create, settings (rename, delete, leave), members (roles, remove, transfer ownership), per `docs/design/households.md`.
- [ ] Real space switcher fed by `GET /api/v1/spaces`; selection persists in the `hemfin-space` cookie and falls back to the personal space if the saved space is no longer accessible.
- [ ] Actions are shown only when the role allows them; the API remains the authority.
- [ ] Responsive at 375, 768, 1280 px, no horizontal scroll, 44 px tap targets, AA.
- [ ] Playwright (phone and desktop projects) with screenshots; assert the `hemfin-space` cookie attributes (httpOnly, sameSite, path), a follow-up from HEM-003.
- [ ] `npm run lint && npm run build` pass; generated client only, never hand edited.

## Handoff log

## Review
