# HEM-014: Design spec, households, invitations and switcher

**Phase:** 2 · **Status:** In Review · **Owner:** Designer · **Depends on:** none

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

### 2026-11-26 Designer, PM decisions applied (docs/design/households.md section 13)
1. Repeat accept: the API returns the generic 404 for a used token. After a successful accept the page clears the token, stores a tab-only marker (id and name, no token), navigates to the household and toasts "You joined {household}." A reload of `/invite` in that tab shows the joined state from the marker, never the generic message (6.8 K, D19).
2. Previous owner becomes admin after a transfer (matches HEM-012). Transfer dialog says so.
3. Record permissions: every member, any role, reads and writes shared records. Admins and owner also manage members, invitations and the name. Only the owner deletes the household or transfers ownership. Role copy and wireframes updated (section 4, D18, 8.2).
4. Delete cascade: the household and all shared data are deleted permanently. Copy says "all shared data" with no record types (6.7, 8.2, D20).
5. Household-page switch exception approved and applied to `docs/design/app-shell.md` section 4.2 (D21).
6. `FormMessage` move to `components/ui/` is for HEM-015 (D22). Not done in this ticket.
**Verify:** docs only in this update, so no code changed. `npm run lint && npm run build` from the first handoff still apply.

### 2026-11-26 Designer, PR #21 review round 1 (CHANGES_REQUESTED, comment 7201127289)
Blocking:
- **B1.** Owner "Leave household" cell in 6.7 is now "disabled, with the text below" (matches the owner text and the button).
- **B2.** Switcher rows are `role="menuitemradio"` in a `role="menu"`, as `app-shell.md` 4.2 says. Keyboard model added in 6.9: focus to the active row on open, Up and Down (wrap), Home and End, Enter or Space selects and closes, Escape closes without change, Tab closes, focus returns to the trigger. Section 10 covers the switcher focus rules.
- **B3.** Not changed in the spec, per PM. The engineer adds the two distinct 409 codes and the 429 to HEM-013.
- **B4.** Create household (6.2) and Not found (6.10) have 768 and 1280 rules, and a table in section 11 covers them, with the accept page.

Nits:
- **N1.** D16 says "Share your finances with family" has five words, so the household list uses "Share finances with family" (four). Cites `app-shell.md` 6 (the four-word rule is not in `design-system.md` section 7).
- **N2.** Empty-state icon circle is `--muted` (no space tint on the household list).
- **N3.** Only-owner empty state: owners and admins get one primary action, members get none (a deliberate exception, written in 6.3).
- **N4.** `DataTable`, `ResponsiveList` and `Toast` are listed as "to build in HEM-015" (5.1), not as existing.
- **N5.** 5.4 no longer repeats the heading row (app-shell 4.2 already requires it). D13 names the 4.2/4.3 wording difference.
- **N6.** Header "Related" no longer says auth-flows covers the banner. The banner example is in `app-shell.md` 7.
- **N7.** Wireframes redrawn with aligned borders: members (phone and desktop), invitations (desktop), delete dialog (phone and desktop), change role (phone and desktop, with the transfer block).
- **N8.** Invitations desktop and tablet text now match the wireframe (Email, Role, Status, Expires or accepted, Actions; no Sent column).
- **N9.** The "accept or decline" row is out of the role table and is a note under it.
- **N10.** Desktop change-role wireframe includes the transfer block.
- **N11.** Personal space id on household routes shows the not-found state (6.10), with a responsive note.
- **N12.** Not applied, per PM: the generic H message keeps "If you were invited at another address". The invitee holds the token, so the hint is acceptable.
- **N13.** Sign-out clears the joined marker in that tab (6.8 K, point 5).
- **N14.** Section 10 covers focus for the switcher sheet and dropdown.
- **N15.** `status-chip.tsx`: one shared `CHIP_BASE` class string and one `ChipShell` renderer for `StatusChip` and `RoleBadge`. Lint and build pass.
- **N16.** This ticket's status is In Review. The board is not edited (PM owns it).
**Verify:** `npm run lint && npm run build` in `web/` pass after the `status-chip.tsx` refactor.

### 2026-11-26 Designer, PR #21 review round 2 (CHANGES_REQUESTED, comment 7201250284)
Blocking:
- **1.** Switcher focus has one model now, stated the same way in 6.9 and section 10. No focus trap for the switcher sheet or dropdown. Tab closes the menu and focus moves to the next focusable control after the trigger. Escape closes and returns focus to the trigger. Selecting a row closes and returns focus to the trigger. Dialogs are the only focus-trapped surfaces (section 10).
Nits:
- **2.** Jordan Kim's phone card row (members, phone) is aligned to the same width as the other rows in that card.
- **3.** 5.4 has a paragraph: the engineer labels the heading row with the household name (D13) until `app-shell.md` 4.2 is aligned. `app-shell.md` 4.2 is aligned to D13 in this PR.
- **4.** HEM-016 has two acceptance checkboxes: the round-trip of the joined marker after accept, and sign-out clearing the marker.
- **5.** Not done here. The board (`docs/backlog/board.md`) is PM-owned, and the PM updates it at review.
- **6.** `design-system.md` section 7 EmptyState row records the role-based exception (`households.md` 6.3).
**Verify:** docs only in this round, so no code changed. `npm run lint && npm run build` from round 1 still apply.

### 2026-11-26 Designer, merge with origin/main (PR #21 was CONFLICTING)
- Merged `origin/main` (HEM-012 merged, board and HEM-013 edits) into `hem-014-design-households` with a merge commit, no rebase, no force-push.
- `board.md`, `HEM-012` and `HEM-013` take main's version. `HEM-014` and `HEM-016` keep this branch's handoff entries and checkboxes, and main has no edits to them.
- Board status not touched.
- `cd web && npm run lint && npm run build` pass after the merge.
- Pushed to PR #21. `gh pr checks 21` shows `api`, `web`, `docker` and `gitleaks` pending (started after the push); PR is MERGEABLE.

### 2026-11-26 Designer, PR #21 review round 2 fixes (Designer session 3)
- **1 (blocking).** Switcher focus model stated once in 6.9 ("Focus model"): no focus trap for the switcher (phone sheet or desktop dropdown). Tab closes the menu and focus moves to the next control after the trigger, and does not return to the trigger. Escape and selection return focus to the trigger. Arrow keys, Home and End move between rows. Section 10 now refers to 6.9 and keeps the trap for dialogs and bottom sheets only.
- **2.** Jordan Kim phone card (6.3) checked: every line is 45 characters, the same as the card border. No change needed at this head.
- **3.** 5.4 now says the phone heading row shows the household name (D13), not "Household" from `app-shell.md` 4.2. `app-shell.md` 4.2 already matches D13 (checked).
- **4.** HEM-016 already has both checkboxes (accept marker and sign-out clears the marker). Checked, no change.
- **5.** Not done here (PM-owned board).
- **6.** `design-system.md` section 7 EmptyState row already records the role-based exception (pointing to `households.md` 6.3). Checked, no change.
**Verify:** docs only, so no code changed. `npm run lint && npm run build` in `web/` run on this head.
**Not touched:** `docs/backlog/HEM-013-api-invitations.md` (engineer, PR #22), `docs/backlog/board.md` (PM).

## Review
