# Households and invitations (HEM-014)

Status: v1 (HEM-014). Owner: Designer. Built by: HEM-015 (household list, create, members, settings, switcher) and HEM-016 (invitations and the `/invite` accept page).
Related: `design-system.md` (tokens, type, focus, dialogs, empty states), `app-shell.md` (shell, nav, space switcher, page header, and the invitation banner example in section 7), `auth-flows.md` (sign-in and sign-up forms, Google button), `profile.md` (form and dialog patterns).

Example data in this spec is fictional. Household names are "The Lee family" and "Lee cousins", people are Alex, Jordan and Sam, and addresses use `example.com`.

---

## 1. Purpose

A household is a shared space. Its members see the household's shared records, and personal records never leave the personal space. This spec covers how a user:

1. Sees and creates households.
2. Manages a household: members, roles, invitations, name, leaving and deleting.
3. Accepts or declines an invitation from an email link, signed in or not.
4. Moves between spaces with the switcher, which now lists real households.

The API decides every permission. The UI only hides actions that a role cannot use, so a stale screen cannot be used to do something the API would refuse.

---

## 2. Decisions in this spec

These decisions are made here so that HEM-015 and HEM-016 can start. Items that need a PM or API call are in section 13.

| # | Decision | Why |
|---|---|---|
| D1 | Household pages live under `/household`. Each household has its own sections at `/household/[spaceId]/members`, `/invitations` and `/settings`. `/household/[spaceId]` redirects to `members`. | Each section can be linked and reloaded, and the back button works. |
| D2 | Section navigation is a row of links with `aria-current="page"`, styled as tabs. It is not an ARIA `tablist`. | Each section is a route, and the ARIA tabs pattern expects in-page panels. |
| D3 | The household page title is the household name, with a `SpaceBadge` (`md`) under it. | Household data is shown, so the badge rule in `app-shell.md` section 5 applies. |
| D4 | The Invitations section is hidden for members. A member who opens its URL is redirected to `members`. | Members cannot use it (the API returns 403). |
| D5 | Creating a household makes it the selected space, the same as accepting an invitation. | The user has just created it and will want to use it. |
| D6 | The accept page `/invite` has no app shell (no bottom nav, no sidebar), in both logged-in and logged-out states. It uses `AuthLayout` with a single column and no brand panel. | It is a single-purpose page reached from email. Navigation would pull the user away before they decide. |
| D7 | Every accept failure shows one generic message. A mismatched email, an expired link, a revoked or used link and an unknown link all look the same. | The API returns the same 404 for all of them, and the wording rule forbids saying why. |
| D8 | The accept page does not show the invited role. The preview returns only the household name and the inviter's display name. | This is what the API returns (HEM-013). |
| D9 | Logged-out users see a generic invitation banner, not "You were invited to [household]". | The preview needs a signed-in user, so the household name is not known yet. This replaces the banner example in `app-shell.md` section 7 (rules) for this flow only. |
| D10 | Declining an invitation asks for confirmation. | Declining is final for that link, and the inviter has to send a new one. |
| D11 | Destructive actions use an alert dialog with the action's name on the button. Delete household also needs the household name typed. | `design-system.md` 7.1, and the ticket's typed-name rule. |
| D12 | Selecting another space while on a household page opens that space's dashboard. | A household page is bound to the household in its URL. Staying on it would show another space's name on a page of this household. This is an exception to `app-shell.md` 4.2, approved by the PM (D21). |
| D13 | The switcher's phone sheet has a heading row with the active space's `SpaceBadge`, labelled with the household name. | `app-shell.md` 4.2 already asks for the heading row, and its text there says "Household". `app-shell.md` 4.3 says the household name, which is what the top bar shows. This spec follows 4.3. The 4.2 wording should be aligned in a later change to `app-shell.md`. |
| D14 | The switcher footer has two links: "Manage households" (`/household`) and "Create a household" (`/household/new`). | The current single footer link cannot reach the list. |
| D15 | The Households list has no space badge. It shows the personal space as a reference card that is not a link. | The page spans spaces. The personal card explains why personal records are not listed. |
| D16 | Empty-state titles have at most four words (`app-shell.md` section 6). The `app-shell.md` example "Share your finances with family" has five words, so this spec uses "Share finances with family" (four words) for the household list. | `app-shell.md` section 6. |
| D17 | Role badges and invitation status chips are new presentational components (`RoleBadge`, `StatusChip`) in `web/src/components/ui/status-chip.tsx`. | No existing component covers them, and the colours must come from the `-subtle` tokens. |
| D18 | Record permissions (PM decision): every member, of any role, can read and write shared records. Admins and the owner also manage members, invitations and the name. Only the owner deletes the household or transfers ownership. Role copy says only this. | Section 4 is the table. |
| D19 | Repeat accept (PM decision): the API returns the generic 404 for a used token. After a successful accept the page clears the token, shows the joined state once, and navigates to the household (section 6.8). A reload of `/invite` in that tab shows the joined state from a marker, not the generic message. | Avoids a failure message after a successful join. |
| D20 | Delete cascade wording (PM decision): deleting permanently removes the household and all shared data. The copy says "all shared data" and lists no record types, because finance records arrive in Phase 3. | PM decision. |
| D21 | Switching space on a household page opens that space's dashboard. Approved by the PM and applied to `app-shell.md` section 4.2 in this ticket. | Replaces the open question. |
| D22 | `FormMessage` moves from `components/auth/form-parts.tsx` to `components/ui/` in HEM-015, not in this ticket. | PM decision. |

---

## 3. Routes and navigation

| Route | Screen | Min role | Sidebar and bottom nav |
|---|---|---|---|
| `/household` | Household list | any member | "Household" (Account). Under More on phone. |
| `/household/new` | Create a household | any signed-in user | "Household" |
| `/household/[spaceId]` | Redirects to `members` | member | "Household" |
| `/household/[spaceId]/members` | Members (with role, remove, transfer) | member | "Household" |
| `/household/[spaceId]/invitations` | Invitations | admin or owner | "Household" |
| `/household/[spaceId]/settings` | Settings (rename, leave, delete) | member | "Household" |
| `/invite` | Accept, decline (token in the URL fragment) | signed in or out | none (no app shell, D6) |

The active route rule from `app-shell.md` 3.5 applies. `/household/new` is a child of `/household`, so "Household" is active on all of these routes.

A non-member gets the not-found state (section 6.10) on every `/household/[spaceId]` route. It is the same screen whether the household exists or not. A personal space's id on these routes also shows it (6.10).

### 3.1 Section navigation inside a household

Phone and tablet: a row of three links, each 44 px tall, in a container that scrolls sideways if needed. At 375 px the three links fit without scrolling.
Desktop: the same row, left-aligned under the title.

| Link | Shown to |
|---|---|
| Members | everyone |
| Invitations | owner and admin |
| Settings | everyone (the content differs by role) |

```
PHONE 375 px, household page header
+-------------------------------------------+
| < Households                              |  back link, 44 px
| The Lee family                            |  text-h1, wraps, never clipped
| [Users  The Lee family]                   |  SpaceBadge md (household)
| Shared with the people you invite.        |  text-lead, max two lines
|                                           |
| [ Members ] [ Invitations ] [ Settings ]  |  section links, 44 px, current has aria-current
|-------------------------------------------|  1 px border
|  ...section body...                       |
+-------------------------------------------+
```

---

## 4. Roles and what the UI shows

The API is the authority. The UI hides an action when the viewer's role cannot use it, and it shows the API's message if a request is still refused (for example, a role changed in another tab).

| Action | Owner | Admin | Member |
|---|---|---|---|
| See the members list and their emails | yes | yes | yes |
| Read and write shared records (PM decision, D18) | yes | yes | yes |
| Rename the household | yes | yes | no. The name is read-only, with a note. |
| See the Invitations section | yes | yes | no (redirect, D4) |
| Invite a member (email and role) | yes | yes | no |
| Resend or revoke an invitation | yes | yes | no |
| Remove an admin | yes | no | no |
| Remove a member | yes | yes | no |
| Change a member's role (admin or member) | yes | no | no |
| Transfer ownership | yes | no | no |
| Leave the household | no. Transfer ownership first. | yes | yes |
| Delete the household | yes | no | no |
Admins cannot remove other admins or the owner. Owners can remove admins and members.

Accepting or declining an invitation is not a role action. Any signed-in user whose verified email matches the invitation can do it (section 6.8).

The owner's own row never shows "Leave". The leave rule is in the settings section.

---

## 5. Components

### 5.1 Existing components used

| Area | Components |
|---|---|
| Page | `PageHeader` (title, description, back link, primary action), `SpaceBadge` (md), `HemCard`, `EmptyState` (`page` and `inline`), `Skeleton`, `Button`, `Input`, `Label` or `Field`, `FormMessage` (`kind` error, success, info), `ResponsiveDialog` (dialog from md, bottom sheet on phone; `alert` for confirmations), `SpaceSwitcher`, `Badge` |
| Lists | `HemCard` (interactive for household cards) |
| Accept page | `AuthLayout` (no brand panel), `Button`, `HemCard` |

Existing in `web/src/components/layout/`: `PageHeader`, `SpaceSwitcher`, `AuthLayout`. Existing in `ui/`: `HemCard`, `SpaceBadge`, `EmptyState`, `Skeleton`, `Button`, `Input`, `Badge`, `ResponsiveDialog`, `MoneyText` (not used here).

**Not in the codebase yet, to build in HEM-015** (design-system section 7 names them, nothing in `web/src/components` yet):

| Component | Used for | Spec |
|---|---|---|
| `DataTable` | Members and invitations tables from md up (6.3, 6.4) | design-system section 7 (Table) |
| `ResponsiveList` | Card list on phone, one card per row (6.3, 6.4) | design-system section 7 (Table) |
| `Toast` | Success toasts (6.1, 6.2, 6.7, 6.8 K, 6.9) | design-system section 7 (Toast), 16 px above the bottom nav on phone |

Until they exist, HEM-015 may build the tables and card lists inline in the screen, with the same layout. Shared versions should go in `ui/`.

`FormMessage` currently lives in `web/src/components/auth/form-parts.tsx`. HEM-015 moves it to `web/src/components/ui/` (D22). The spec calls it `FormMessage` in both places. The design system lists an "Alert" component, but none exists in `ui/` yet. Use `FormMessage` for every inline error and success message.

### 5.2 New presentational components

In `web/src/components/ui/status-chip.tsx`. Each takes props only. The labels and icons are constants inside the file, so no business logic is in them.

**`RoleBadge`** (`role`: `owner` | `admin` | `member`), height 24 px, `text-caption` (12 px) medium, `rounded-full`, icon 12 px before the text.

| Role | Label | Icon (lucide) | Fill and text |
|---|---|---|---|
| owner | Owner | `Crown` | `--primary` fill, `--primary-foreground` text |
| admin | Admin | `ShieldCheck` | `--accent` fill, `--accent-foreground` text |
| member | Member | `User` | `--card` fill, 1 px `--border`, `--foreground` text |

**`StatusChip`** (`status`: `pending` | `expired` | `accepted` | `declined` | `revoked`), same size and type as `RoleBadge`.

| Status | Label | Icon | Fill and text |
|---|---|---|---|
| pending | Pending | `Clock` | `--muted` fill, `--foreground` text |
| expired | Expired | `TriangleAlert` | `--warning-subtle` fill, `--warning` text (needs attention, so amber is allowed) |
| accepted | Accepted | `CircleCheck` | `--success-subtle` fill, `--success` text |
| declined | Declined | `CircleX` | `--muted` fill, `--muted-foreground` text |
| revoked | Revoked | `Ban` | `--muted` fill, `--muted-foreground` text |

Every chip has its text label, and the icon is decorative (`aria-hidden`). Colour is never the only signal.

### 5.3 Contrast for the new pairs

Measured with the hex values in `design-system.md` section 2.1 (WCAG 2.x relative luminance). All text pairs pass 4.5:1.

| Text | Background | Light | Dark |
|---|---|---|---|
| `--primary-foreground` | `--primary` | 11.4:1 | 9.0:1 |
| `--accent-foreground` | `--accent` | 8.4:1 | 7.9:1 |
| `--foreground` | `--muted` | 14.1:1 | 13.0:1 |
| `--muted-foreground` | `--muted` | 6.1:1 | 6.4:1 |
| `--muted-foreground` | `--card` | 7.0:1 | 7.5:1 |
| `--success` | `--success-subtle` | 6.0:1 | 6.4:1 |
| `--warning` | `--warning-subtle` | 4.8:1 | 7.2:1 |
| `--destructive` | `--background` | 6.5:1 | 6.3:1 (from `design-system.md`) |
| `--destructive` | `--destructive-subtle` | 5.8:1 | 5.2:1 |

The input border (`--input`, 3.7:1 on the background) is the non-text contrast for form fields. The focus ring is `--ring` (6.8:1 light, 9.7:1 dark).

### 5.4 Changes to the existing switcher (HEM-015)

`web/src/components/layout/space-switcher.tsx` needs these changes, on top of the behaviour already in `app-shell.md` 4.2. This list is the only place these changes are written down.

1. Footer: two links, "Manage households" (`/household`) and "Create a household" (`/household/new`), each 44 px tall (D14). The current code has one link.
2. Names are truncated by code point, not by UTF-16 unit, so an emoji or a surrogate pair is never split. The full name stays in the accessible name and `title`.
3. The sheet rows clamp household names to two lines (`line-clamp-2`), so long names stay readable.
4. Rows use `role="menuitemradio"` and the keyboard model in 6.9.

The phone heading row (D13) is already required by `app-shell.md` 4.2. It is not a change here, so the code should already be doing it.

---

## 6. Screens

Breakpoints: 375 (phone), 768 (tablet, icon rail, 2-column cards, centred dialogs), 1280 (desktop, sidebar, 2-column cards, table with the "Joined" column). Full responsive rules are in section 11.

### 6.1 Household list (`/household`)

**Purpose.** Show the households the user belongs to, with their role, and start a new one.

**Phone 375 px**

```
+-------------------------------------------+
| [H]   [Lock Personal v]          (bell)   |  top bar 56 px
+===========================================+  2 px Personal accent (active space)
|                                           |
| Households                                |  text-h1
| Shared finances with family. Personal     |  text-lead
| records are never shared.                 |
|                                           |
| [ + Create a household                ]   |  full width, 44 px
|                                           |
| +---------------------------------------+ |
| | [Lock] Personal                       | |  reference card, not a link
| | Only you can see it. It is not listed | |
| | here.                                 | |
| +---------------------------------------+ |
|                                           |
| +---------------------------------------+ |
| | The Lee family                     > | |  interactive card, 2 px household edge
| | [Crown Owner]  4 members              | |
| +---------------------------------------+ |
| | Lee cousins                        > | |
| | [User Member]  2 members              | |
| +---------------------------------------+ |
|                                           |
+-------------------------------------------+
| Dashboard  Contracts  Reports  Alerts More|  bottom nav
+-------------------------------------------+
```

**Desktop 1280 px.** Sidebar (256 px) with "Household" active. Content 1120 px max. Heading row: title on the left, "Create a household" primary button on the right. Cards in a 2-column grid (`md:grid-cols-2`). The personal reference card spans the full width above the grid.

```
+-----------+--------------------------------------------------------------+
| Account   | Households                              [ + Create a household ]|
|  Household*| Shared finances with family. Personal records are never shared.|
|  Profile  |                                                              |
|           | +-----------------------------------------------------------+|
|           | | [Lock] Personal   Only you can see it. Not listed here.   ||
|           | +-----------------------------------------------------------+|
|           | +-------------------------------+ +-----------------------+ |
|           | | The Lee family             >  | | Lee cousins        >  | |
|           | | [Crown Owner]  4 members      | | [User Member] 2 members| |
|           | +-------------------------------+ +-----------------------+ |
+-----------+--------------------------------------------------------------+
```

**Components.** `PageHeader` (no `space`), `Button` (primary), `HemCard` (`variant="interactive"`, `space="household"` on household cards, `variant="muted"` on the personal card), `RoleBadge`, `Skeleton`, `EmptyState` (`page`), `FormMessage` (error).

**Card content.** Household name (`text-h3`, clamped to two lines, `break-words`). Role badge. Member count ("1 member", "4 members", using `Intl.PluralRules`). Chevron, `aria-hidden`. The whole card is one link. Its accessible name is the household name followed by the role, for example "The Lee family, Owner".

**States**

| State | What the user sees | Copy |
|---|---|---|
| Loading | Personal card (static), then 2 skeleton cards with the same height as household cards. `aria-busy` on the list. Screen-reader text. | (sr) "Loading your households" |
| Empty (no households) | `EmptyState` page, icon `Users` in a 56 px `--muted` circle (no space is active on this list, so no space tint; `design-system.md` section 6). Personal card still shown above it. Primary button "Create a household". | Title: "Share finances with family". Body: "Create a household, then invite a partner or family member by email. They see only what the household shares." |
| Error | `FormMessage` kind error above the list, with a Retry button (44 px). | "We could not load your households just now." Button: "Retry". If the API gives a `detail`, it follows the line. |
| Populated | Cards as above. | none |
| Success (after create or leave) | `FormMessage` kind success, `role="status"`, above the list. | "Household created." or "You left The Lee family." |

**Responsive.** Phone: one column, the create button full width. Tablet: two columns, the create button in the heading row. Desktop: as above.

**Focus order.** Create button, then the personal card (not focusable), then each household card in list order.

---

### 6.2 Create a household (`/household/new`)

**Purpose.** Create a household space. The user becomes its owner.

**Phone 375 px**

```
+-------------------------------------------+
| [H]   [Lock Personal v]          (bell)   |
+-------------------------------------------+
| < Households                              |  back link
| Create a household                        |  text-h1
| Name the shared space. Everyone you       |  text-lead
| invite sees the name.                     |
|                                           |
| +---------------------------------------+ |
| | Household name                        | |  Label
| | [ The Lee family                   ]  | |  44 px input, 16 px text
| | For example, The Lee family.          | |  hint
| | Up to 80 characters.                  | |
| |                          9 of 80 used | |  counter, from 60 characters only
| |                                       | |
| | You will be the owner. Only people    | |  reassurance
| | you invite can join. Your personal    | |
| | space stays separate.                 | |
| |                                       | |
| | [ Create household                 ]  | |  full width, 44 px
| | Cancel                                | |  text link, 44 px
| +---------------------------------------+ |
+-------------------------------------------+
| Dashboard  Contracts  Reports  Alerts More|
+-------------------------------------------+
```

**Tablet 768 px.** The card is max 560 px wide, in the content area next to the icon rail, left-aligned under the title. "Create household" is auto width. The reassurance text and the counter sit above the buttons.

**Desktop 1280 px.** The card is max 560 px wide, left-aligned under the title, in the content area next to the sidebar. "Create household" is auto width. No second column.

**Components.** `PageHeader` (back link, description), `HemCard`, `Field` (label, hint, error), `Button`, `FormMessage`.

**Validation (on blur and on submit).** The name is trimmed. The length is counted in code points.

| Rule | Message (under the field) |
|---|---|
| Empty or only spaces | "Enter a name for the household." |
| More than 80 characters | "Use at most 80 characters." |

After a failed submit, focus moves to the name field. Errors are announced politely.

**States**

| State | What the user sees | Copy |
|---|---|---|
| Loading | Form skeleton (label and input shapes). | (sr) "Loading" |
| Idle | Empty form. | as above |
| Busy | Button shows the busy label and keeps its width. `aria-busy` on the form. A second submit is ignored. | "Creating…" |
| Limit reached (409) | `FormMessage` kind error at the top of the form. The form keeps its value. | "You can own up to 10 households. Transfer or delete one to create another." |
| Network error | `FormMessage` kind error at the top of the form. | "We could not reach the server. Check your connection and try again." |
| Success | Navigates to `/household/[id]/members`. The new household is the selected space. Toast (16 px above the bottom nav). | Toast: "Household created." |

---

### 6.3 Members (`/household/[spaceId]/members`)

**Purpose.** Show who is in the household and their role. Owners and admins change roles and remove people. Owners transfer ownership.

**Phone 375 px**

```
+-------------------------------------------+
| [H]   [Users The Lee family v]   (bell)   |  top bar, 2 px household edge
+===========================================+
| < Households                              |
| The Lee family                            |  text-h1
| [Users  The Lee family]                   |  SpaceBadge md
| Owners and admins manage who has access.  |  text-lead
|                                           |
| [ Members ] [ Invitations ] [ Settings ]  |  section links
|-------------------------------------------|
| Members (4)                               |  h2
| Email addresses are shown to members      |  text-small
| of this household only.                   |
|                                           |
| +---------------------------------------+ |
| | (AL) Alex Lee          [Crown Owner]  | |  avatar: initials on --muted
| |      alex@example.com                 | |  text-small, break-all
| |      Joined 3 Nov 2026 · You          | |
| +---------------------------------------+ |
| +---------------------------------------+ |
| | (JK) Jordan Kim     [ShieldCheck Admin] | |
| |      jordan@example.com               | |
| |      Joined 12 Nov 2026               | |
| |  [ Change role ]    [ Remove ]        | |  44 px each, 8 px gap
| +---------------------------------------+ |
| +---------------------------------------+ |
| | (SL) Sam Lee            [User Member] | |
| |      sam@example.com                  | |
| |      Joined 20 Nov 2026               | |
| |  [ Change role ]    [ Remove ]        | |
| +---------------------------------------+ |
+-------------------------------------------+
```

**Desktop 1280 px.** Table in a card. Columns: Member (avatar, name, email, "You" tag), Role, Joined, Actions (right-aligned). The Joined column appears from `xl` only.

```
+---------------------------------+----------------------+-------------+-------------+
| Member                          | Role                 | Joined      | Actions     |
+---------------------------------+----------------------+-------------+-------------+
| (AL) Alex Lee  You              | [Crown Owner]        | 3 Nov 2026  |             |
|      alex@example.com           |                      |             |             |
| (JK) Jordan Kim                 | [ShieldCheck Admin]  | 12 Nov 2026 | Change role |
|      jordan@example.com         |                      |             | Remove      |
+---------------------------------+----------------------+-------------+-------------+
```

**Tablet 768 px.** The same table without the "Joined" column (it appears from `xl`). Member, Role and Actions only.

**Row rules.**

- Order: owner first, then admins, then members. Within a group, by name (`Intl.Collator`).
- The viewer's own row has a "You" tag and no actions. Leaving is in Settings.
- Owner rows have no actions for the owner. Only the owner can transfer ownership, from the role dialog of another member.
- Admin rows: an owner sees "Change role" and "Remove". An admin sees no actions.
- Member rows: an owner sees "Change role" and "Remove". An admin sees "Remove" only. A member sees no actions.

**Only-owner empty state.** When the household has one member (the owner), an `EmptyState` `inline` card sits below the owner row. For owners and admins it has one primary action. For members it has no action, because a member cannot invite. That is a deliberate exception to the one-primary-action rule in `app-shell.md` 6.

- Title: "Invite your family" (three words).
- Body: "Invite a partner or family member by email. They see only what the household shares."
- Primary action "Invite a member" (owner and admin only) → `/invitations`. For a member, the card shows the body with no button.

**Components.** `PageHeader` with `SpaceBadge`, section links (3.1), `HemCard`, `Badge` replaced by `RoleBadge`, avatar initials (`--muted` circle, `text-small`, `aria-hidden` because the name is next to it), `Button` (outline, `sm`, 44 px), `ResponsiveDialog` for role change and remove (section 6.5), `EmptyState` (`inline`), `Skeleton`, `FormMessage`.

**States**

| State | What the user sees | Copy |
|---|---|---|
| Loading | 3 skeleton cards on phone, 3 skeleton rows in the table on md+. `aria-busy` on the list. | (sr) "Loading members" |
| Empty | Not reachable as a list, because the owner is always a member. The only-owner card (above) covers it. | see above |
| Error | `FormMessage` kind error above the list with a Retry button. The page header and section links stay. | "We could not load members just now." Button: "Retry" |
| Populated | Rows as above. | none |
| Role changed | `FormMessage` kind success above the list, `role="status"`. The row updates. | "Role updated for Jordan Kim." |
| Removed | `FormMessage` kind success above the list. Focus moves to the "Members" heading. | "Jordan Kim was removed from The Lee family." |
| Transferred | Ownership moves. Your row changes to Admin. Success message. | "Alex Lee is now the owner. You are an admin." |
| Refused by API (role changed elsewhere) | `FormMessage` kind error in the dialog or above the list, with the API's detail. | server `detail`, or "We could not save that change. Refresh the page and try again." |

**Responsive.** Phone: cards, buttons 44 px in a row. Tablet: table without "Joined". Desktop: table with "Joined".

**Focus order.** Section links, then rows top to bottom; within a row, the actions in order.

---

### 6.4 Invitations (`/household/[spaceId]/invitations`)

**Purpose.** Invite people by email, see pending and past invitations, and resend or revoke them. Owners and admins only.

**Phone 375 px**

```
+-------------------------------------------+
| [H]   [Users The Lee family v]   (bell)   |
+===========================================+
| < Households                              |
| The Lee family                            |
| [Users  The Lee family]                   |
|                                           |
| [ Members ] [ Invitations ] [ Settings ]  |  Invitations is current
|-------------------------------------------|
| +---------------------------------------+ |
| | Invite someone                        | |  h2
| | They get an email with a link. It     | |
| | works only for the address you enter  | |
| | and expires after 7 days.             | |
| | Email address                         | |
| | [ name@example.com                 ]  | |  44 px, autocomplete off
| | They need to use this address to      | |  hint
| | accept.                               | |
| | Role                                  | |
| | (o) Member   Reads and writes shared  | |  radio group, 44 px rows
| |              records.                 | |
| | ( ) Admin    Can invite and remove    | |
| |              members.                 | |
| | [ Send invitation                  ]  | |  full width
| +---------------------------------------+ |
|                                           |
| Invitations                               |  h2
| +---------------------------------------+ |
| | sam@example.com                       | |  break-all
| | Member · Expires 3 Dec 2026           | |
| | [Clock Pending]                       | |
| | [ Resend ]    [ Revoke ]              | |  44 px
| +---------------------------------------+ |
| | taylor@example.com                    | |
| | Admin · Expired 19 Nov 2026           | |
| | [TriangleAlert Expired]               | |
| | [ Resend ]    [ Revoke ]              | |
| +---------------------------------------+ |
| | jordan@example.com                    | |
| | Member · Accepted 14 Nov 2026         | |
| | [CircleCheck Accepted]                | |  no actions
| +---------------------------------------+ |
|                                           |
| [ Show more invitations ]                 |  cursor pagination, 44 px
+-------------------------------------------+
```

**Desktop 1280 px.** Form in a card on the left (30 characters wide), list as a table on the right. Columns: Email (role under it on md, its own column from xl), Status, Expires or accepted, Actions.

```
+-----------------------------+  +------------------------+---------+-----------+--------------------+---------------+
| Invite someone              |  | Email                  | Role    | Status    | Expires / accepted | Actions       |
| Email address               |  +------------------------+---------+-----------+--------------------+---------------+
| [ name@example.com        ] |  | sam@example.com        | Member  | Pending   | 3 Dec 2026         | Resend Revoke |
| (o) Member  ( ) Admin       |  | taylor@example.com     | Admin   | Expired   | Expired 19 Nov     | Resend Revoke |
| [ Send invitation        ]  |  | jordan@example.com     | Member  | Accepted  | 14 Nov 2026        | none          |
+-----------------------------+  +------------------------+---------+-----------+--------------------+---------------+
```

**Tablet 768 px.** Form above the list, both full width of the content area (max 640 px). The table has three columns: Email (role under it), Status, Actions. There is no "Sent" column at any width.

**Form rules**

- The email field has `autocomplete="off"` so the signed-in user's own address is not filled in. It uses `type="email"`, `inputMode="email"`, `autoCapitalize="none"`, `spellCheck={false}`.
- Role is a radio group. "Member" is the default. Admin is not the default.
- Validation on blur and on submit:

| Rule | Message |
|---|---|
| Empty | "Enter the email address to invite." |
| Not an address | "Enter an email address like name@example.com." |

**Row rules**

- Pending and expired rows have Resend and Revoke. Accepted, declined and revoked rows have no actions.
- Pending rows show "Expires {date}". Expired rows show "Expired {date}". Accepted rows show "Accepted {date}".
- Order: newest first. The list uses cursor pagination with a "Show more invitations" button.

**Components.** `Field` (email), native radio inputs in a `fieldset` with a legend (no RadioGroup component exists yet), 44 px rows, `Button`, `HemCard`, `StatusChip`, `EmptyState` (`inline`), `ResponsiveDialog` (alert, revoke), `FormMessage`, `Skeleton`.

**States**

| State | What the user sees | Copy |
|---|---|---|
| Loading | Form shows at once. The list shows 3 skeleton cards (phone) or 3 skeleton rows (md+). `aria-busy`. | (sr) "Loading invitations" |
| Empty | `EmptyState` `inline` in the list card, icon `Mail`, button "Invite someone" that moves focus to the email field (no navigation). | Title: "No invitations yet". Body: "Invite a partner or family member by email. They see only what you share." |
| Error (list) | `FormMessage` kind error above the list with Retry. The form still works. | "We could not load invitations just now." Button: "Retry" |
| Form busy | Button "Sending…", keeps its width, `aria-busy`. | "Sending…" |
| Sent | Form clears. `FormMessage` kind success above the form, `role="status"`. New row at the top of the list. | "Invitation sent to sam@example.com. The link works for 7 days." |
| Already a member (409) | Field error under the email field. | "This person is already a member of the household." |
| Already invited (409, pending exists) | Field error under the email field. | "There is already a pending invitation for this address. Resend it or revoke it below." |
| Email not set up (503) | `FormMessage` kind error above the form. | "Invitations are not available right now. Try again later." |
| No permission (403, role changed) | `FormMessage` kind error above the form. The page reloads its role-based view on the next navigation. | "You no longer have permission to invite people." |
| Network error | `FormMessage` kind error above the form. | "We could not reach the server. Check your connection and try again." |
| Resend busy | Row button "Sending…", others in the row disabled. | "Sending…" |
| Resent | Row `FormMessage` kind success (inside the row, `role="status"`). Expiry date updates. | "Invitation resent. The old link no longer works." |
| Resend rate limited (429) | Row `FormMessage` kind error. | "You can resend this invitation up to 3 times a day. Try again tomorrow." |
| Revoked | Row leaves "Pending" and shows "Revoked". Focus moves to the list heading. Status message. | "Invitation revoked." |
| Load more (busy) | "Loading…" on the button. | "Loading…" |

**Responsive.** See the wireframes and section 11.

**Focus order.** Email, role radios, "Send invitation", then each row (Resend, Revoke), then "Show more invitations".

---

### 6.5 Member dialogs

All three use `ResponsiveDialog`: a centred dialog from md, a bottom sheet on phone with the footer pinned. The body scrolls inside the sheet.

**Change role** (`role="dialog"`, opened from "Change role"). The transfer block appears only for an owner viewing a non-owner row.

```
Phone 375
+---------------------------------------+
|        ---                            |
| Change role for Jordan Kim            |
| (o) Admin                             |
|     Invite, remove members,           |
|     rename. Reads and writes          |
|     shared records.                   |
| ( ) Member                            |
|     Reads and writes shared           |
|     records.                          |
| Only one owner. To hand over          |
| the household, transfer               |
| ownership.                            |
| [ Transfer ownership        ]         |
| [ Save role                 ]  pinned |
| [ Cancel                    ]         |
+---------------------------------------+

Desktop 1280
+-------------------------------------------------------------------------+
| Change role for Jordan Kim                                            x |
|                                                                         |
| (o) Admin                                                               |
|     Invite, remove members, rename. Reads and writes shared records.    |
| ( ) Member                                                              |
|     Reads and writes shared records.                                    |
|                                                                         |
| Only one owner. To hand over the household, transfer ownership.         |
| [ Transfer ownership ]                                                  |
|                                                                         |
|                                         [Cancel] [Save role]            |
+-------------------------------------------------------------------------+
```

- Title: "Change role for {name}". Description: the text for the currently selected role (section 8.2, "Role: Admin" or "Role: Member").
- The "Transfer ownership" block appears only for an owner viewing a non-owner row. Its button opens the transfer alert.
- The radio group starts on the current role. "Save role" is disabled until the role changes.
- Initial focus: the selected radio.

**Remove member** (`alertdialog`, opened from "Remove").

```
+-------------------------------+
|        ---                    |
| Remove Jordan Kim?            |
| Jordan Kim will lose access   |
| to the shared records of The  |
| Lee family. They keep their   |
| personal space. An owner or   |
| admin can invite them again.  |
+-------------------------------+
| [   Remove member     ] red   |
| [       Cancel         ]      |  focused first
+-------------------------------+
```

**Transfer ownership** (`alertdialog`, opened from the role dialog).

- Title: "Make {name} the owner?"
- Body: "{name} becomes the only owner. They can rename or delete the household and change roles. You become an admin."
- Buttons: "Transfer ownership" (default variant, not red, because it is not a removal), "Cancel" (focused first).

**Dialog states** (all three)

| State | What the user sees | Copy |
|---|---|---|
| Idle | Content and buttons as above. | |
| Busy | Primary button "Saving…" or "Removing…" or "Transferring…", keeps its width. Cancel and close disabled. Escape and outside tap do not close. `aria-busy` on the dialog. | "Saving…", "Removing…", "Transferring…" |
| Error | `FormMessage` kind error at the top of the body. The dialog stays open. | server `detail` or "We could not save that change. Check your connection and try again." |
| Success | Dialog closes. `FormMessage` success above the list. Focus goes to the section heading. | see 6.3 |

Dialog button labels: "Save role", "Remove member", "Transfer ownership". Never "OK".

---

### 6.6 Invitation revoke (`alertdialog`)

- Title: "Revoke this invitation?"
- Body: "{email} can no longer use the link. You can invite them again later."
- Buttons: "Revoke invitation" (destructive), "Cancel" (focused first).
- Busy: "Revoking…". Error: `FormMessage` in the dialog.

Resend has no confirmation. It is not destructive, and the old link stops working, which the success message says.

---

### 6.7 Settings (`/household/[spaceId]/settings`)

**Purpose.** Rename the household, leave it, or delete it. Each part is a separate card, shown only to the roles that can use it.

**Phone 375 px**

```
+-------------------------------------------+
| [H]   [Users The Lee family v]   (bell)   |
+===========================================+
| < Households                              |
| The Lee family                            |
| [Users  The Lee family]                   |
|                                           |
| [ Members ] [ Invitations ] [ Settings ]  |  Settings is current
|-------------------------------------------|
| +---------------------------------------+ |
| | Household name                        | |  h2 in card
| | [ The Lee family                   ]  | |  44 px
| | Shown to everyone in the household.   | |
| | [ Save changes                     ]  | |  full width, disabled until changed
| +---------------------------------------+ |
| +---------------------------------------+ |
| | Leave household                       | |  h2
| | You lose access to this household's   | |
| | shared records. Your personal space   | |
| | is not affected.                      | |
| | [ Leave household                  ]  | |  outline, destructive text
| +---------------------------------------+ |
| +=======================================+ |  destructive border (danger zone)
| | Delete household                      | |
| | This permanently deletes the household| |
| | and all shared data, for everyone.    | |
| | It cannot be undone.                  | |
| | [ Delete household                 ]  | |  destructive
| +=======================================+ |
+-------------------------------------------+
```

**Who sees what**

| Card | Owner | Admin | Member |
|---|---|---|---|
| Household name (form) | editable | editable | read-only text, note: "Only owners and admins can rename the household." |
| Leave household | disabled, with the text below | enabled | enabled |
| Owner leave text | see below | n/a | n/a |
| Delete household | shown | hidden | hidden |

**Owner and leave.** An owner cannot leave until another member is the owner. The owner's "Leave" card shows the disabled button and the text: "You are the owner. Transfer ownership to another member before you leave." The text is linked to the button with `aria-describedby`. A link "Go to members to transfer ownership" (44 px) sits under it.

**Rename rules**

- Same validation as 6.2 (trim, 1 to 80 code points).
- "Save changes" is disabled until the value differs from the saved name.
- Saving changes the name everywhere: the switcher, the top bar, the badge on this page and the household list. The shell refreshes the space list after a successful save.

**Leave dialog** (`alertdialog`)

- Title: "Leave {name}?"
- Body: "You lose access to this household's shared records. Your personal space is not affected. An owner or admin can invite you again."
- Buttons: "Leave household" (destructive), "Cancel" (focused first).
- On success: navigates to `/household` and shows the list with the message "You left {name}." The active space falls back to the personal space if this household was selected.
- Owners do not open this dialog: their card shows the disabled button instead (section 6.7, owner and leave).

**Delete dialog** (`alertdialog`, typed name, D11)

```
Phone 375
+------------------------------------+
|        ---                         |
| Delete The Lee family?             |
| This permanently deletes the       |
| household and all shared data,     |
| for everyone. It cannot be undone. |
| Type The Lee family to confirm     |
| [                             ]    |
| Type the name exactly as it        |
| appears above.                     |
| [ Delete household           ] red |
| [ Cancel                     ]     |
+------------------------------------+

Desktop 1280
+---------------------------------------------------------------------------+
| Delete The Lee family?                                                  x |
| This permanently deletes the household and all shared data, for everyone. |
| It cannot be undone.                                                      |
|                                                                           |
| Type The Lee family to confirm                                            |
| [                                                                ]        |
| Type the name exactly as it appears above.                                |
|                                                                           |
|                                               [Cancel] [Delete household] |
+---------------------------------------------------------------------------+
```

- Initial focus: the typed-name input.
- The confirm button is disabled until the typed value matches the household name exactly (after trimming; case-sensitive). It keeps its label, and the hint under the input explains what to type.
- Blur with a non-matching value: "The name does not match. Type it exactly as shown above."
- Busy: "Deleting…", Cancel disabled, dismiss blocked.
- Error: `FormMessage` in the dialog, the dialog stays open, the typed value is kept.
- On success: navigates to `/household`, message "{name} was deleted." If it was the active space, the shell switches to personal.

**States (settings page)**

| State | What the user sees | Copy |
|---|---|---|
| Loading | Three card skeletons. `aria-busy`. | (sr) "Loading settings" |
| Error | `FormMessage` kind error above the cards, with Retry. | "We could not load these settings just now." Button: "Retry" |
| Rename busy | "Saving…", keeps width, `aria-busy` on the form. | "Saving…" |
| Rename success | `FormMessage` kind success under the heading of the card. | "Household name saved." |
| Rename error | `FormMessage` kind error. | server `detail`, or "We could not reach the server. Check your connection and try again." |
| Rename limit or validation | Field error under the input. | "Enter a name for the household." / "Use at most 80 characters." |
| Leave busy | "Leaving…" on the confirm button. | "Leaving…" |
| Delete busy | "Deleting…" on the confirm button. | "Deleting…" |

Settings has no empty state: a household always has a name and an owner.

---

### 6.8 Accept an invitation (`/invite`)

**Purpose.** Accept or decline an invitation from the email link. The token is in the URL fragment (`/invite#token=…`), so it never reaches server logs or referrers. The page reads it in the browser and clears it from the address bar (HEM-016). The token is not shown anywhere on the page.

**Layout.** `AuthLayout`, single column at every width, logo above the card, no brand panel (D6). The card is 440 px max and centred. `Referrer-Policy: no-referrer` is set by the page, as HEM-016 requires.

**States and wireframes**

**A. Checking the invitation (loading).** Skeleton title and two text lines in a card. `aria-busy`. Screen-reader text "Checking your invitation".

**B. Signed out.**

```
+-------------------------------------------+
|                 [H] HemFin                |
|                                           |
| Join a household                          |  h1
| You have a household invitation. Sign in  |  text-lead
| or create an account to see it. Only the  |
| address it was sent to can accept it.     |
| +---------------------------------------+ |
| | Only you can see personal records.    | |  reassurance (design-system 8)
| | Household members see only what the   | |
| | household shares.                     | |
| +---------------------------------------+ |
| [ Sign in                             ]   |  primary, 44 px
| [ Create an account                   ]   |  outline
+-------------------------------------------+
```

- "Sign in" and "Create an account" carry the token forward (kept in `sessionStorage` by HEM-016). The sign-in and sign-up pages show no token.
- Sign-up pre-fills nothing from the invitation.
- After auth, the user returns to `/invite`. The page is the same as state C.

**C. Signed in, invitation loaded.**

```
+-------------------------------------------+
|                 [H] HemFin                |
|                                           |
| Join The Lee family                       |  h1, household name wraps
| Jordan Kim invited you. Once you join,    |  text-lead
| you see what the household shares. Your   |
| personal records stay private.            |
| [ Accept invitation                   ]   |  primary, full width on phone
| [ Decline                             ]   |  outline, full width on phone
|                                           |
| Signed in as alex@example.com.            |  text-small, muted
| Not you? Sign out.                        |  link, 44 px
+-------------------------------------------+
```

- The inviter's name is their display name from the preview. If the preview has no display name, the line reads "Someone in the household invited you."
- The signed-in email is the viewer's own address. It is shown so they can see which account they are using.

**D. Declining (alert dialog).** Title "Decline this invitation?". Body "The Lee family will not be joined. Jordan Kim can send another invitation." Buttons "Decline invitation" (destructive), "Cancel" (focused first). Busy: "Declining…".

**E. Accepting (busy).** "Joining…" on the accept button, keeps its width. Decline disabled. `aria-busy` on the card.

**F. Joined (shown from the marker only, see K).** The page normally navigates away after a success, so this state appears only on a reopened `/invite` in the same tab.

```
+-------------------------------------------+
|                 [H] HemFin                |
|                                           |
| (check) You joined The Lee family         |  h1 with CircleCheck (success)
| The Lee family is now your selected space.|  text-lead
| [ Go to dashboard                     ]   |  primary
| [ View members                        ]   |  outline
+-------------------------------------------+
```

- The h1 takes focus on arrival. The success text has `role="status"`.

**G. Declined (success).** h1 "Invitation declined". Body "You did not join The Lee family." Button "Go to dashboard" if signed in, otherwise "Go to HemFin" (to the landing page).

**H. Cannot be used (generic, D7).** This one message covers an expired link, a revoked link, a used link, an unknown link, a missing fragment, and an email that does not match the signed-in account.

```
+-------------------------------------------+
|                 [H] HemFin                |
|                                           |
| This invitation can't be used             |  h1
| This invitation link is no longer valid.  |  text-lead
| Ask the person who invited you to send    |
| a new one.                                |
| If you were invited at another address,   |
| sign out, then sign in with that address. |  path forward (text-body)
| [ Sign out                            ]   |  outline (only when signed in)
| [ Go to dashboard                     ]   |  primary (only when signed in)
+-------------------------------------------+
```

- Use this exact text for every case. Do not add a reason or a hint about which check failed. The 404 from the API is treated as this state.
- Logged-out users never see this state, because the preview is not called until sign-in. A missing token skips the API call and shows this state.

**I. Could not reach HemFin (server or network).** This is not about the invitation, so it can give the reason. h1 "We could not check your invitation". Text "We could not reach HemFin. Check your connection and try again." Button "Try again" (44 px). For a 5xx, the text is "HemFin is having trouble right now. Try again in a few minutes."

**J. Session ended during the flow (401).** Redirect to sign-in with the token kept, with the banner "Sign in again to continue." (The invitation banner example in `app-shell.md` section 7 is not used here, D9.)

**K. After a successful accept (PM decision, D19).** The API returns the generic 404 for a used token, so the page never calls accept twice and never shows state H after a success. Sequence:

1. Accept succeeds. The page clears the token from memory and `sessionStorage` at once.
2. The page stores a marker in `sessionStorage` for this tab only: the household's id and name, and no token. Its only use is state F below.
3. The page navigates (replace, not push) to `/household/[spaceId]/members`, which is now the selected space. A toast says "You joined {household}."
4. If `/invite` is reopened in the same tab with no token, and the marker is present, the page shows state F from the marker without calling the API. The marker is removed when the user leaves the accept flow with "Go to dashboard" or "View members".
5. **Sign-out clears the marker.** Signing out (from any screen, including "Sign out" on this page) removes the marker from `sessionStorage` in that tab, so the next user of the browser never sees "You joined {household}" from someone else's session. The marker is not shared between tabs.

If there is no marker and no token, the page shows state H. The page never shows state H for a reload after a success.

**Accept and decline buttons on phone.** Both are full width and 44 px tall. Accept is first in the reading order.

**Components.** `AuthLayout` (`title`, `description`, `banner` unused here), `HemCard`, `Button`, `AlertDialog` through `ResponsiveDialog` (`alert`), `FormMessage`, `Skeleton`. The success icon is `CircleCheck`, with text.

**Focus and announcements.**

- On load: focus stays on the page (no auto-focus into the card). The h1 is the first heading.
- On state change (C → F, C → H, C → G), focus moves to the new h1, and the new text is announced with `role="status"` or `role="alert"` (H uses `role="alert"`).
- Decline dialog: focus on "Cancel" first.

---

### 6.9 Space switcher with real households

The switcher is already in the shell (`app-shell.md` 4.2). This section adds the household behaviour.

**Phone sheet (375 px)**

```
+-------------------------------------------+
|                 ____                      |  drag handle
| Switch space                         (X)  |  SheetTitle text-h3
|-------------------------------------------|
| [Users  The Lee family]                   |  heading row: SpaceBadge md, active space,
|                                           |  not clickable (D13)
|-------------------------------------------|
| [Lock]  Personal                 [check]  |  row 56 px, active
|         Only you                          |
| [Users] The Lee family                    |  row 56 px
|         Owner                             |
| [Users] Lee cousins with a longer name    |  name clamps to two lines
|         that wraps onto a second line     |
|         Member                            |
|-------------------------------------------|
| Manage households                         |  link, 44 px
| Create a household                        |  link, 44 px
+-------------------------------------------+
```

- Rows are `role="menuitemradio"` inside a `role="menu"` named "Spaces", with `aria-checked` (as `app-shell.md` 4.2). The check mark is visible on the active row and is not the only signal (the row also has the text "Owner" or "Only you"). The same role is used on the desktop dropdown.
- Personal is always the first row. Households follow, sorted by name (`Intl.Collator`).
- Selecting a row changes the space, closes the menu or sheet, and keeps the current page, except on household pages (D12).
- **Keyboard model (both the sheet and the dropdown):**
  - When the menu opens, focus goes to the active row.
  - Down and Up arrows move focus to the next and previous row. Focus wraps at the ends. Home and End go to the first and last row.
  - Enter or Space selects the focused row, changes the space, and closes the menu. Focus returns to the trigger (for the sheet, after the sheet has closed).
  - Escape closes the menu without changing the space, and focus returns to the trigger.
  - Tab closes the menu and moves focus to the next control in the page, as the platform menu does. Focus still returns to the trigger on close, so the next Tab continues from there.
  - The footer links are after the rows in the reading order. Arrow keys skip them; they are reached with Tab.

**Desktop dropdown (1280 px)**

```
                                 +----------------------------------+
                                 | [Users  The Lee family]          |  heading row, SpaceBadge md
                                 |----------------------------------|
                                 | [Lock]  Personal           [v]   |  row 44 px+
                                 |         Only you                 |
                                 | [Users] The Lee family           |
                                 |         Owner                    |
                                 | [Users] Lee cousins              |
                                 |         Member                   |
                                 |----------------------------------|
                                 | Manage households                |
                                 | Create a household               |
                                 +----------------------------------+
```

- 280 px wide, aligned to the trigger's right edge. Radio items, as on phone.

**Trigger**

- Phone: 44 px, `rounded-full`, the active space's icon and name, name truncated to 14 code points with an ellipsis. Accessible name: "Active space: {full name}. Switch space."
- Tablet and desktop: the name truncates at the trigger's maximum width (176 px) with an ellipsis. Full name in `title` and the accessible name.
- Fill: `--personal-subtle` or `--household-subtle`. Icon and text carry the meaning.

**States**

| State | What the user sees | Copy |
|---|---|---|
| Spaces loading | Trigger shows a 44 px skeleton pill. Accessible name "Loading spaces". | (sr) "Loading spaces" |
| Spaces error | Trigger shows "Spaces unavailable" (no guessed name, no badge). Opening the menu shows the error and a Retry button (44 px). | "Spaces unavailable" / "We could not load your spaces. Try again." Button: "Retry" |
| Only personal | Sheet or menu lists Personal, then "Create a household" in the footer. | none |
| Switching | Accent line, trigger fill and badges update at once. Page content shows skeletons until the new space's data is loaded. The previous space's numbers are never shown. | none |
| Removed from the active household | Shell switches to personal and shows a toast. | "You no longer have access to The Lee family." |
| Saved space no longer accessible on load | Falls back to personal (HEM-015). Same toast. | as above |
| Household page for a space that is not yours | Not-found state (6.10). | as 6.10 |

**Household pages and switching (D12).** When the page is `/household/[spaceId]/*`, choosing a different space opens that space's dashboard (`/`). Choosing the same space keeps the page.

---

### 6.10 Household not found

Used for any `/household/[spaceId]/*` route where the API returns 404, whether the household is missing or the user is not a member.

```
+-------------------------------------------+
| < Households                              |
| We could not find that household          |  h1
| Check the link, or choose a household     |  text-lead
| from your list.                           |
| [ Go to households                    ]   |  primary
+-------------------------------------------+
```

- The copy never says whether the household exists.
- The page uses the normal shell (bottom nav or sidebar).
- No space badge.
- **Personal space id.** A `/household/[spaceId]/*` URL whose id is the user's personal space (or any space the user is not a household member of) shows this state. The API does not return members for a personal space, so the page never shows a personal space as a household.

**Responsive.**

- 375 px: the phone layout above. Single column, button full width.
- 768 px: the same content in the content area next to the icon rail, max 640 px wide, left-aligned. Button auto width.
- 1280 px: the same content next to the sidebar, max 640 px wide, left-aligned. Button auto width.

---

## 7. States per screen, at a glance

| Screen | Loading | Empty | Error | Success |
|---|---|---|---|---|
| Household list (6.1) | skeleton cards | Share finances with family (page) | banner with Retry | created or left message |
| Create (6.2) | form skeleton | n/a | limit or network | toast, navigate |
| Members (6.3) | skeleton cards or rows | only-owner card (inline) | banner with Retry | role, removed or transferred |
| Invitations (6.4) | skeleton cards or rows | No invitations yet (inline) | banner with Retry | sent, resent, revoked |
| Dialogs (6.5, 6.6) | n/a | n/a | inside the dialog | close and message |
| Settings (6.7) | card skeletons | n/a (always has a name) | banner with Retry | saved, left or deleted |
| Accept (6.8) | checking skeleton | n/a | generic (H) or reach (I) | joined or declined |
| Switcher (6.9) | skeleton pill | Only personal | Spaces unavailable | toast on removal |
| Not found (6.10) | n/a | n/a | the not-found page | n/a |

---

## 8. Content and microcopy

### 8.1 Wording rules

- Sentence case. No exclamation marks. No "Oops".
- Say what the action does: "Send invitation", "Remove member", "Revoke invitation". Never "OK".
- Destructive buttons use the action's name. Cancel is always "Cancel".
- Count people with `Intl.PluralRules`: "1 member", "4 members".
- Dates use `Intl.DateTimeFormat` with `{ day: "numeric", month: "short", year: "numeric" }` ("3 Dec 2026").
- Address and email text uses `break-all` or `overflow-wrap: anywhere`, so it never causes horizontal scroll.
- **Invitation failures:** on the accept page, use only the generic message in 6.8 H. Do not say why an invitation failed, which check failed, or whether an address exists. Elsewhere (for the inviter), name the conflict the admin can fix ("already a member", "already invited").
- Privacy reassurance appears at invitation and sign-in moments, using the wording in `design-system.md` section 8.

### 8.2 Copy by area

| Where | Text |
|---|---|
| Household list description | "Shared finances with family. Personal records are never shared." |
| Personal reference card | "Only you can see it. It is not listed here." |
| Create description | "Name the shared space. Everyone you invite sees the name." |
| Create reassurance | "You will be the owner. Only people you invite can join. Your personal space stays separate." |
| Members description | "Owners and admins manage who has access." |
| Members email note | "Email addresses are shown to members of this household only." |
| Invite explanation | "They get an email with a link. It works only for the address you enter and expires after 7 days." |
| Invite hint | "They need to use this address to accept." |
| Role: Admin | "Can invite people, remove members and rename the household. Reads and writes shared records." |
| Role: Member | "Reads and writes shared records." |
| Settings rename hint | "Shown to everyone in the household." |
| Settings read-only name | "Only owners and admins can rename the household." |
| Owner leave text | "You are the owner. Transfer ownership to another member before you leave." |
| Accept, signed out | "You have a household invitation. Sign in or create an account to see it. Only the address it was sent to can accept it." |
| Accept, signed in | "{Inviter} invited you. Once you join, you see what the household shares. Your personal records stay private." |
| Accept, reassurance | "Only you can see personal records. Household members see only what the household shares." |
| Accept, signed in as | "Signed in as {email}. Not you? Sign out." |
| Accept, generic (D7) | Title "This invitation can't be used". "This invitation link is no longer valid. Ask the person who invited you to send a new one. If you were invited at another address, sign out, then sign in with that address." |
| Accept, reach error | "We could not reach HemFin. Check your connection and try again." |
| Joined | "You joined {household}." / "{household} is now your selected space." |
| Declined | "Invitation declined." / "You did not join {household}." |
| Delete warning | "This permanently deletes the household and all shared data, for everyone. Members lose access straight away. It cannot be undone." |
| Leave warning | "You lose access to this household's shared records. Your personal space is not affected. An owner or admin can invite you again." |
| Remove warning | "{name} loses access to the shared records of {household}. They keep their personal space. An owner or admin can invite them again." |
| Transfer warning | "{name} becomes the only owner. They can rename or delete the household and change roles. You become an admin." |
| Revoke warning | "{email} can no longer use the link. You can invite them again later." |
| Decline warning | "{household} will not be joined. {inviter} can send another invitation." |
| Not found | Title "We could not find that household". "Check the link, or choose a household from your list." |

### 8.3 Success messages

| Event | Message |
|---|---|
| Household created | "Household created." |
| Household left | "You left {name}." |
| Household deleted | "{name} was deleted." |
| Name saved | "Household name saved." |
| Role changed | "Role updated for {name}." |
| Member removed | "{name} was removed from {household}." |
| Ownership transferred | "{name} is now the owner. You are an admin." |
| Invitation sent | "Invitation sent to {email}. The link works for 7 days." |
| Invitation resent | "Invitation resent. The old link no longer works." |
| Invitation revoked | "Invitation revoked." |
| Removed from the active household | "You no longer have access to {name}." (toast) |

---

## 9. Money and dates

This flow has no money. Dates appear on invitations, members and the accept page, and always show the absolute date (`Intl.DateTimeFormat`, section 8.1). Relative times ("in 3 days") are not used.

---

## 10. Accessibility

- **Tap targets.** Every link, button, radio row and card action is at least 44 × 44 px. Radio rows are at least 44 px tall including the label. Household cards are one link at least 56 px tall.
- **Contrast.** Section 5.3. Input borders use `--input` (3.7:1). Focus rings use `--ring`.
- **Focus.** The global 2 px `--ring` outline with a 2 px offset, on `:focus-visible` only (`design-system.md` 4.5). Shown in both themes.
- **Dialogs.** Focus is trapped and returned to the trigger on close. Escape closes, except while busy. The first focus target is named in each section above. Destructive alert dialogs focus "Cancel" first.
- **Switcher sheet and dropdown.** Focus moves to the active row on open, is trapped while open, and returns to the trigger on close (Escape, selection or Tab out). The keyboard model is in 6.9. Escape closes without changing the space. Both use the same rules on phone and desktop.
- **Labels.** Every input has a visible label. Hints and errors are linked with `aria-describedby`. Invalid fields have `aria-invalid`. The email field has `autocomplete="off"`.
- **Live regions.** Success messages use `role="status"` (polite). Errors use `role="alert"` (or `aria-live` through `FormMessage`). Field errors are polite. The accept page announces each state change once.
- **Status is not colour alone.** Roles have icons and words. Invitation statuses have icons and words. Expired and pending both show a date.
- **Reduced motion.** Dialogs and sheets fade only (no translate). Skeletons do not pulse. Transitions are 0 ms.
- **Headings.** One `h1` per page. Sections are `h2`. Card titles are `h3`. The accept page h1 changes with its state.
- **Names.** Icon-only buttons have `aria-label`. Accessible names start with the visible label where a visible label exists (WCAG 2.5.3), for example "Resend invitation to sam@example.com".
- **Long text.** Household names, emails and addresses wrap or clamp. Nothing is cut off without an accessible full text.
- **Focus after destructive actions.** After a removal or a revoke, focus moves to the section heading (or the list heading) so the user is not left on a removed control.

---

## 11. Responsive behaviour

| Width | Shell | Household list | Members | Invitations | Settings | Dialogs |
|---|---|---|---|---|---|---|
| 375 | Bottom nav, 16 px gutter | 1 card per row, create button full width | Cards, buttons in a row (44 px) | Form above cards, buttons full width | Stacked cards | Bottom sheets, footer pinned |
| 768 | Icon rail (72 px), 24 px gutter | 2 cards per row, create button in heading row | Table: Member, Role, Actions | Form above list (max 640 px), table without "Sent" | Cards, max 640 px wide | Centred dialogs (`max-w-md`) |
| 1280 | Sidebar (256 px), 32 px gutter | 2 cards per row | Table with "Joined" | Form beside list (`xl`), table with all columns | Cards, max 640 px wide | Centred dialogs |

Screens that are not in the table above:

| Screen | 375 | 768 | 1280 |
|---|---|---|---|
| Create household (6.2) | One column. Card and button full width. | Card max 560 px in the content area. Button auto width. | Card max 560 px in the content area. Button auto width. |
| Not found (6.10) | One column. Button full width. | Content max 640 px. Button auto width. | Content max 640 px. Button auto width. |
| Accept page (6.8) | One column, card max 440 px, centred. | Same as 375. | Same as 375. No brand panel at any width (D6). |

Rules:

- No horizontal scroll at 375, 768 or 1280. Long emails and names wrap. The section links scroll inside their own row only if needed.
- Tables become card lists on phone. Money does not appear here, but the Joined and Sent dates stay right-aligned in tables.
- The accept page: single column at all widths, 440 px max card, centred.
- The space switcher: sheet below 768, dropdown from 768 (as in `app-shell.md` 4.2).
- Toasts sit 16 px above the bottom nav on phone, and at the bottom edge on tablet and desktop.

---

## 12. Acceptance check (for the reviewer)

Use the checklist in `app-shell.md` section 9 and add:

- [ ] Each household page at 375, 768 and 1280: no horizontal scroll, all tap targets at least 44 px.
- [ ] Members: phone cards, md+ table. Role and remove buttons follow section 4 for owner, admin and member (test each).
- [ ] Invitations hidden for members, and their URL redirects to Members.
- [ ] The accept page shows the generic message for an expired, revoked, used, unknown or mismatched invitation, with the same text and the same styling. No state names the reason.
- [ ] After a successful accept, the page clears the token, navigates to the household, and a reload of `/invite` in that tab shows the joined state, not the generic message (6.8 K).
- [ ] Role copy matches section 4 and D18 (members and admins read and write shared records; only the owner deletes or transfers).
- [ ] The decline and revoke dialogs focus Cancel first. The delete dialog focuses the name input and disables the button until the name matches.
- [ ] The switcher heading row shows the active space's badge, and the footer has two links.
- [ ] Each status chip and role badge has text and an icon, and passes the contrast table in 5.3 in both themes.
- [ ] Empty, loading and error states are present on each screen (section 7).

---

## 13. Decisions and open items

The PM answered the open questions on 2026-11-26. Each answer is applied in the sections named.

| # | Question | Decision | Applied in |
|---|---|---|---|
| 1 | Mismatch and invalid look the same (D7). | Yes. The API is the authority. One generic message. | 6.8 H |
| 2 | Repeat accept after success. | The API returns the generic 404 for a used token. After a successful accept, the page clears the token and navigates to the household. It must not claim failure on reload. | 6.8 K, D19 |
| 3 | Preview before sign-in. | No. Logged-out users see the generic banner (D9). | 6.8 B, D9 |
| 4 | Previous owner's role after a transfer. | Becomes admin, matching HEM-012. | 6.5 transfer dialog |
| 5 | Record permissions. | Every member, any role, reads and writes shared records. Admins and the owner also manage members, invitations and the name. Only the owner deletes the household or transfers ownership. | section 4, D18, section 8.2 role copy |
| 6 | Delete cascade. | The household and all shared data are deleted permanently. Copy says "all shared data" and lists no record types, because finance records arrive in Phase 3. | 6.7, section 8.2, D20 |
| 7 | Switching space on a household page. | Approved. Household pages open that space's dashboard. Applied to `app-shell.md` 4.2 in this ticket. | D21, 6.9 |
| 8 | Create makes the household active. | Yes. | D5 |
| 9 | Accept or decline of a declined or revoked invitation. | Generic 404, so the generic state. | 6.8 H |
| 10 | `FormMessage` location. | Approved. Moved to `components/ui/` in HEM-015, not in this ticket. | D22 |
| 11 | Alert component. | Not decided here. Use `FormMessage` until a repeated pattern needs an Alert. | 5.1 |
| 12 | Section links instead of ARIA tabs. | Section links (D2). | 3.1 |

---

## 14. Changes to other specs

- `app-shell.md` 4.2 (behaviour): on a household page, choosing another space opens that space's dashboard (D21). Applied in this ticket.
- `app-shell.md` 4.2 (footer): the switcher footer has two links, "Manage households" and "Create a household" (D14). HEM-015 applies this to the component.
- `app-shell.md` 7 (rules): the invitation banner example is not used on the accept flow (D9).
