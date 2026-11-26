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

### 2026-11-26, Engineer (Sonnet 5.5)
**Done.** Branch `hem-015-web-households`. PR: https://github.com/rizvisarwar/HemFin/pull/23.
- Routes: `/household` (list), `/household/new`, `/household/[spaceId]` (redirects to members), `members`, `invitations` (placeholder only, HEM-016 builds the real section), `settings`. Not-found screen for a missing household, a non-member and a personal space id (same screen).
- Members: cards on phone, table from md (Joined from xl). Owner: change role, remove, transfer. Admin: remove members only. Member: no actions. Row rules live in `web/src/lib/households/households.ts` (`memberActions`, unit tested). The API's `detail` is shown when it still refuses.
- Settings: rename (owner, admin), read-only name for members, leave (owner sees a disabled button with the reason), delete with the typed name (owner).
- Switcher rewritten as a menu (`web/src/components/layout/space-switcher.tsx`): one markup, bottom sheet below md and dropdown from md, no focus trap. Arrows wrap, Home/End, Enter selects and returns focus to the trigger, Escape closes and returns focus, Tab closes and moves to the next control after the trigger. Heading row with SpaceBadge (household name), two footer links, names truncated by code point, rows clamp to two lines.
- Cookie: layout validates `hemfin-space` against `/me`; a stale id falls back to personal, the cookie is rewritten and a toast says so (name taken from this tab's sessionStorage, generic text otherwise). Create selects the new household (D5). Leaving or deleting the active household resets the cookie to personal. D12: on `/household/<id>/*`, choosing another space opens `/dashboard`.
- `FormMessage` moved to `components/ui/form-message.tsx` (D22). New `ToastProvider` in the shell. `ResponsiveDialog` gained `finalFocus`. `SpaceBadge` gained `wrap`. `PageHeader` h1 wraps long names.
- Tests: `tests/households.spec.ts` (behaviour, 3 projects), `tests/households-screens.spec.ts` (screenshots), smoke test asserts cookie attributes, dev check covers the new routes. Mock backend now holds real households and members.

**Verify.** `cd web && npm run lint && npm test && npx playwright test` (twice) and `npx playwright test -c playwright.dev.config.ts`. Screenshots: `web/test-results/screenshots/hem015/<project>/<state>-<light|dark>.png`.

**Known limitations and follow-ups.**
- The switcher footer links are not reachable with the keyboard from inside the open menu: Tab closes the menu (spec 6.9 says both "Tab closes" and "footer links are reached with Tab"; the task brief chose Tab closes). The same destinations are reachable from the Household nav item and the list page. Needs a design decision.
- The shell still blocks on `/me` (spaces come from `/me`, not `GET /api/v1/spaces`, which has the same data minus member counts), so the switcher's "spaces loading" and "Spaces unavailable" states are not built.
- `EmptyState` renders link actions with `role="button"` (Base UI `render`); my own new links use real links. Worth fixing in `EmptyState`.
- First tap on "Create household" with an invalid name can be lost in Safari when the error appears on blur and shifts the button (Chromium skips blur validation when focus moves to the button). Typing clears the error live.
- Phone loading skeleton screenshots are taken in Chromium at 375 px (WebKit holds streamed fallbacks hidden); folder `loading-375`.
- WebKit reports a Lax cookie as sameSite None through the cookie API, so the smoke test reads the raw Set-Cookie header.

## Review
