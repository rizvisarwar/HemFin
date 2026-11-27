# In-app notifications (HEM-025)

Status: v1 (HEM-025). Owner: Designer. Built by: HEM-027 (web). API: HEM-026.
Related: `design-system.md` (tokens, type, dialogs, toasts), `app-shell.md` (top bar, bell, nav, empty-state pattern), `finance.md` (dates and amounts, `DueChip`, the `ConfirmDialog` pattern).

Scope: **in-app only.** No email, no daily digest, no preferences screen. Sweden only: dates and amounts use the `sv-SE` format. UI text is English.

Example data is fictional. The household is "The Lee family", and the contracts are "Home insurance", "Car insurance" and "Gym membership". Amounts are examples only.

---

## 1. Purpose

A notification tells a member that a contract has something coming up: a payment, a renewal, a notice deadline or an end date. It is an alert, not a task list. The user reads it, taps it to see the contract, or dismisses it. The bell shows how many are unread, so the user can see at a glance that something needs them.

---

## 2. Decisions

| # | Decision | Why |
|---|---|---|
| N1 | The bell is a link to `/notifications`. It has no popover. | One place to read and act. A popover is too small on a phone. |
| N2 | The unread badge caps at **9+** (the ticket's rule). Its accessible name always gives the exact count. | A badge that fits in 20 px. Screen reader users still hear "12 unread". |
| N3 | The badge uses `--primary` (navy), not `--destructive` red. | An unread count is not an error. The design system keeps red for errors and destructive actions (design-system.md, section 1). This changes `app-shell.md`, which is updated in this PR. |
| N4 | The list shows the **active space only**. Each space has its own unread count. | Same as the API route, which is per space. Every page with finance data shows the `SpaceBadge` (app-shell.md, section 5). |
| N5 | The row title is the **stable copy** (for example "Car insurance renews"). The event date goes on its own line. The title does not contain a date or "in 7 days". | A stored "in 7 days" goes stale the next day. The date is shown on its own line, so it can be read and sorted. PM decision Q1 (section 15.1). |
| N6 | Tapping a row marks it read and opens the contract. The navigation does not wait for the mark-read request. | The user gets where they went. A failed mark-read leaves the row unread, and it is tried again next time. |
| N7 | "Mark all as read" has no confirmation. It is not destructive and it only changes the read state. | Keeps the flow short. |
| N8 | Dismiss acts at once, with no confirmation. | PM decision (2026-11-27, Q3): dismissing is low-stakes and this is a POC. |
| N9 | Dismissing only hides the notification from this list. It never changes the contract, its dates or any money. | The row's copy and the spec make this clear, so the user is not afraid of a side effect. |
| N10 | Failed actions show an inline alert above the list. They do not use a toast. | Toasts auto-dismiss after 6 s, and error messages should stay until the user has read them (design-system.md, section 7). |
| N11 | Read and unread are shown with a bold title, a left bar and the visible word "New", not colour alone. | WCAG 1.4.1. |

---

## 3. The bell badge (all widths)

The count is shown wherever the Notifications item appears: the top bar bell, the bottom nav "Alerts" slot (phone), the icon rail (tablet) and the sidebar (desktop).

### 3.1 Rules

- **Shows** when the unread count is 1 or more. **Hidden** at 0. Hidden while the count is loading (never show "0" as a placeholder).
- **Text:** the exact number from 1 to 9. From 10 up it shows "9+". The number is `tabular-nums`.
- **Component:** `CountBadge` (`web/src/components/ui/count-badge.tsx`, `max` defaults to 9). It is `aria-hidden`.
- **Style:** `--primary` fill, `--primary-foreground` text, `text-caption` (12 px), minimum 20 × 20 px, fully rounded.
- **Accessible name** of the control (set by the shell, from the exact count):
  - 0 or loading: "Notifications"
  - 1 or more: "Notifications, 3 unread" (exact, so "Notifications, 12 unread" even though the badge reads "9+")
- The badge is never the only signal. The text in the name carries the number, and the bell is never coloured to show a count.

### 3.2 Phone top bar (375 px)

```
+---------------------------------------------------------+
| HemFin                 [Lock Personal v]        (B 3)   |  56 px bar
+=========================================================+
```
`(B 3)` is the 44 × 44 px bell button. The badge sits at its top-right corner. It overlaps the icon, and its hit area stays 44 × 44 px.

### 3.3 Other places

| Place | Badge position | Notes |
|---|---|---|
| Bottom nav, "Alerts" slot | Top-right of the 32 × 24 px icon pill | The label stays "Alerts" (app-shell.md, section 3.1). |
| Icon rail (768 px) | Top-right of the 48 × 48 px button | The tooltip and `aria-label` give the full count. |
| Sidebar (1280 px) | Right edge of the item, vertically centred | The item is 44 px tall, so the badge is easy to hit. |

---

## 4. Notification centre (`/notifications`)

### 4.1 Page anatomy

1. Page header: title "Notifications", the active space's `SpaceBadge`, and an intro line.
2. Unread line: "3 unread", in `text-small`. Shown only when the count is above 0.
3. "Mark all as read" button. Phone: full width under the intro. Tablet and desktop: right side of the header row.
4. The list, newest first (`created_at`), one card per row.
5. "Show more" when there is a `next_cursor`.

### 4.2 Phone (375 px)

```
+---------------------------------------------------------+
| HemFin                 [Lock Personal v]        (B 3)   |  top bar 56 px
+=========================================================+
|                                                         |
|  Notifications                                          |  h1, 24 / 32
|  [Lock] Personal                                        |  SpaceBadge
|  Renewals and payments that need your attention.        |  text-body
|  3 unread                                               |  text-small
|                                                         |
|  [ Mark all as read                                 ]   |  outline, full width, 44 px
|                                                         |
|  +-----------------------------------------------------+|
|  ||  (icon)  Home insurance payment is due     [New]   ||  unread: left bar, bold title
|  ||          Due 1 jan. 2027, 1 234,50 kr             ||
|  ||          Added today                              ||
|  ||                                   [ Dismiss ]     ||  ghost, 44 px
|  +-----------------------------------------------------+|
|  +-----------------------------------------------------+|
|  |   (icon)  Car insurance renews                      ||  read: normal title, no chip
|  |           Renews 1 jan. 2027, 4 350,00 kr           ||
|  |           Added 3 days ago                          ||
|  |                                   [ Dismiss ]       ||
|  +-----------------------------------------------------+|
|                                                         |
|                   [ Show more ]                         |  outline, 44 px, when next_cursor
|                                                         |
+=========================================================+
| [Dash]    [Contracts]   [Reports]   [Alerts]    [More]  |  bottom nav, "Alerts" active
+---------------------------------------------------------+
```

- Gutter 16 px. Cards are full width. Card padding 16 px.
- The whole card is one link to the contract (see 5.3). The "Dismiss" button sits above the link, so it can be tapped on its own.

### 4.3 Tablet (768 px)

```
+------+--------------------------------------------------+
| HemFin                     [Lock Personal v]  (B 3)     |  top bar 64 px
+======+==================================================+
| Rail |  Notifications                [Mark all as read] |  header row, 24 px gutter
|  [D] |  [Lock] Personal                                 |
|  [C] |  3 unread                                        |
|  [R] |                                                  |
|  [A] |  +--------------------------------------------+  |  list max 720 px wide
|  [M] |  ||  (icon)  Home insurance payment is due [New]| |
|      |  ||          Due 1 jan. 2027, 1 234,50 kr      | |
|      |  ||          Added today         [ Dismiss ]   | |
|      |  +--------------------------------------------+  |
|      |  +--------------------------------------------+  |
|      |  |   (icon)  Car insurance renews             |  |
|      |  +--------------------------------------------+  |
+------+--------------------------------------------------+
```

- The rail's Alerts button shows the badge (3.3). The rail is 72 px and the content gutter is 24 px.
- Rows keep their phone layout. At this width the row can hold the dismiss button on the right, so it is inside the card footer.

### 4.4 Desktop (1280 px)

```
+-------------+--------------------------------------------------------------+
| HemFin      | HemFin                             [Lock Personal v]  (B 3)  |  top bar 64 px
| Overview    +==============================================================+
|  Dashboard  |                                                              |
|  Alerts  3  |  Notifications                           [ Mark all as read ] |
| Money       |  [Lock] Personal     3 unread                                |
|  Contracts  |                                                              |
|  Reports    |  +----------------------------------------------------------+|  list max 720 px
|  ...        |  ||  (icon)  Home insurance payment is due      [New]      ||
| Account     |  ||          Due 1 jan. 2027, 1 234,50 kr                   ||
|  Profile    |  ||          Added today                 [ Dismiss ]        ||
| [Lock] Personal                                                          |
+-------------+----------------------------------------------------------------+
```

- The sidebar is 256 px. The content area is 1120 px at most, so the list is capped at 720 px and starts at the left edge of the content.
- The sidebar shows the Alerts count on the right (3.3).

---

## 5. Rows

### 5.1 Anatomy

Each row is a `HemCard` (variant `interactive`).

| Part | Phone and tablet | Desktop | Notes |
|---|---|---|---|
| Icon | 40 px circle, `--muted` fill, icon 20 px in `--foreground` | Same | Icon by type (section 6). Decorative. |
| Title | `text-body-strong`, up to 2 lines | Same | The link text (5.3). |
| Unread chip | `Badge` (default, primary fill), text "New", top-right | Same | Unread rows only. |
| Left bar | 4 px `--primary` on the card's left edge | Same | Unread rows only. |
| Event line | `text-small`, `--muted-foreground` | Same | Date (and amount when there is one). |
| Added line | `text-small`, `--muted-foreground` | Same | Relative, or a date (5.4). |
| Dismiss | Ghost `Button`, 44 px tall, label "Dismiss", right-aligned in the footer | Same | Acts at once (7.2). |

### 5.2 Read and unread

| State | Left bar | Chip | Title weight | Accessible name starts with |
|---|---|---|---|---|
| Unread (`read_at` is null) | Yes, `--primary` | "New" | 600 | "Unread," |
| Read | No | No | 500 | (nothing) |

Unread titles are weight 600 and read titles weight 500. Both are readable, and the unread row also has the bar and the word "New", so the difference does not rely on weight or colour alone.

### 5.3 Tap to open the contract

- The title is a link to `/contracts/{contract_id}`. It is stretched over the whole card with an `after:absolute after:inset-0` pseudo-element, so the full card is the tap target (44 px minimum, in practice 72 px or more).
- The Dismiss button is `relative z-10`, so it sits above the stretched link.
- On tap: fire `POST .../{id}/read` (if unread), then navigate. Do not wait for the response (N6).
- Keyboard: Tab reaches the title link, then the Dismiss button. Enter on the link opens the contract.

### 5.4 Event line and added line

- **Event line:** the label for the type, then the date in `sv-SE`, then the amount when there is one, separated by a comma. Example: "Due 1 jan. 2027, 1 234,50 kr".
  - Date: `event_date` as a calendar date (no time), formatted with `Intl.DateTimeFormat("sv-SE", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" })`. The output is "1 jan. 2027".
  - Amount: `Intl.NumberFormat("sv-SE", { style: "currency", currency })` on the decimal string from the API. The output is "1 234,50 kr". Never convert it to a number first.
  - The amount is omitted when `amount` is null.
- **Added line:** from `created_at`, in the user's time zone (Europe/Stockholm).
  - Created today: "Added today".
  - Created yesterday: "Added yesterday".
  - 2 to 6 days ago: "Added 3 days ago" (`Intl.RelativeTimeFormat("en", { numeric: "auto" })`, in days).
  - 7 days or more: "Added 20 nov. 2026" (the date in `sv-SE`).

---

## 6. The four types

Each type has one icon, one title pattern and one event label. The server sends the title (decision N5). The UI shows it as is, so the copy below is the server's copy.

| `type` | Icon (lucide) | Title pattern (`title`) | Event line | Example title | Example event line |
|---|---|---|---|---|---|
| `payment_due` | `CreditCard` | "{contract} payment is due" | "Due {date}" + amount | Home insurance payment is due | Due 1 jan. 2027, 1 234,50 kr |
| `renewal` | `RefreshCw` | "{contract} renews" | "Renews {date}" + amount | Car insurance renews | Renews 1 jan. 2027, 4 350,00 kr |
| `notice_deadline` | `Hourglass` | "Notice deadline for {contract}" | "Notice by {date}" | Notice deadline for Gym membership | Notice by 1 jan. 2027 |
| `contract_end` | `CalendarX` | "{contract} ends" | "Ends {date}" | Mobile plan ends | Ends 1 jan. 2027 |

- Icons are `lucide-react`, 20 px, decorative (`aria-hidden`). The type is always also named in the title text, so the icon is not the only signal.
- The window for each type (7 days for payment and renewal, 30 days for notice and end) is the API's job. The UI does not need it.

---

## 7. Actions

### 7.1 Mark all as read

- Button: "Mark all as read", `outline`, 44 px. Phone: full width under the intro. Tablet and desktop: right of the page title.
- Disabled when there are no unread rows. Use `aria-disabled` so the button stays in the focus order (7.4).
- On success: every row becomes read, the unread line and the badge disappear, and the polite announcement "All notifications marked as read." is made (9.2).
- The unread count for the bell is updated after the API confirms (204), in line with `design-system.md` (optimistic only where the API has confirmed the write).
- On failure: the rows stay as they were, and the inline alert from 8.3 appears above the list.

### 7.2 Dismiss one row

1. Tap "Dismiss". There is no dialog (PM decision, Q3). The app sends `POST .../{id}/dismiss` at once.
2. On 204 the row is removed and focus moves as in 9.1.
3. Failure: the row stays, and the inline alert from 8.3 appears above the list.

Dismissed rows never come back in the list. Dismiss is not undoable in this POC, and the row copy and this spec say that it only hides the notification.

### 7.3 Show more

- Button: "Show more", `outline`, 44 px, centred under the list. Shown only when there is a `next_cursor`.
- While loading: the button shows a spinner and the text "Loading", with `aria-busy` on the list.
- On success: the new rows are appended. Focus moves to the first new row (9.3).
- On failure: the button is replaced by an inline line "We could not load more. Try again." with a "Try again" button.

### 7.4 Keyboard summary

| Control | Keys |
|---|---|
| Bell | Enter opens `/notifications`. |
| Mark all as read | Enter or Space. |
| Row title link | Enter opens the contract. |
| Dismiss | Enter or Space dismisses the row at once, and focus moves as in 9.1. |

---

## 8. States

### 8.1 Loading (first load)

- The page header and the intro render at once. The unread line and the "Mark all as read" button are not shown until the count arrives.
- The list shows three skeleton cards with the same size as a row: an icon circle, two text lines and a footer line.
- The list has `aria-busy="true"` and an sr-only status "Loading notifications".
- The skeleton's pulse is `motion-safe:animate-pulse`. Under reduced motion it is static.
- The bell shows no badge and the label "Notifications" while loading.

### 8.2 Empty

Used when the list has no rows, including after the user has dismissed everything. "Mark all as read" and the unread line are hidden.

- Component: `EmptyState`, variant `page`, icon `Bell` (the 56 px circle takes the active space's accent, `space="active"`).
- Title: "You are all caught up"
- Body: "We will tell you here when a renewal, payment or contract end is coming up. Only you can see these."
- Primary action: "Review your contracts", links to `/contracts`.
- No secondary link.
- After a dismiss or mark-all that empties the list, the page changes to this state without a toast. The announcement from 9.2 is enough.

Layout at 375 px: 48 px from the top of the content, centred, the button full width. At 1280 px: the same, with the button at its natural width.

### 8.3 Error

**Page load fails.** Replaces the list. An inline alert, not a page-level error screen. The header stays usable.

```
+-----------------------------------------------------+
| (!) We could not load your notifications             |  role="alert", destructive-subtle fill
|     Check your connection and try again.             |  text-small
|     Your contracts are not affected.                 |
|     [ Try again ]                                    |  outline, 44 px
+-----------------------------------------------------+
```

- Fill `--destructive-subtle`, text `--destructive` and the word "We could not", plus the `CircleAlert` icon. Not colour alone.
- "Try again" re-runs the list request and shows the loading state.

**An action fails** (mark read, mark all, dismiss): an inline alert above the list with `role="alert"`, and a text message: "We could not update your notifications. Try again." It stays until the next successful action or until the user closes it. No row changes until the API confirms, so a failed request leaves the list as it was.

**Unread count fails:** silent. The bell shows no badge and no error. The list page shows its own error if the list also fails. A count error should not alarm the user.

### 8.4 Success

Success is shown by the change itself: the row goes, the badge goes, the list changes. No toast is used for these actions (N10 and 9.2). The announcement is the only extra signal.

---

## 9. Focus and announcements

### 9.1 Focus

- Focus rings: the global `:focus-visible` outline (2 px `--ring`, 2 px offset). Never removed.
- Opening `/notifications` from the bell: focus starts at the top of the page, as for any page.
- After a successful dismiss (PM decision, Q3), focus goes to:
  1. the Dismiss button of the next row, if there is one;
  2. otherwise, when the dismissed row was the last one, the Dismiss button of the previous row (the PM did not name this case; this is the spec's choice);
  3. otherwise, when the list is now empty, the empty-state heading (an `h2` with `tabIndex={-1}`).
- After "Mark all as read", focus goes to the page title (`h1`, `tabIndex={-1}`), because the button is disabled once there is nothing unread.
- After "Show more", focus goes to the first new row's title link.

### 9.2 Announcements

| Event | Who | Politeness | Text |
|---|---|---|---|
| Mark all as read succeeds | Page status region (sr-only, `role="status"`) | polite | "All notifications marked as read." |
| Dismiss succeeds | Page status region | polite | "Notification dismissed." |
| Last row dismissed or marked all (list is now empty) | Page status region | polite | "You are all caught up." |
| Show more loads rows | Page status region | polite | "{n} more notifications loaded." |
| Unread count goes up while the app is open (a refresh finds new rows) | App shell status region (sr-only) | polite | "{n} new notifications." |
| An action fails | Inline alert | assertive (`role="alert"`) | "We could not update your notifications. Try again." |

- The count is never announced on first load, only when it rises while the user is on the app. Users are not interrupted by a count they already had.
- The bell's accessible name changes with the count. That is a name change, not a live region, so it is not announced again. The status text above is the announcement.
- Polite messages are never announced over a dialog's own text. The status region sits outside the dialog.

### 9.3 Reduced motion

- Row removal has no animation. The row disappears.
- Dialogs fade only, with no translation (design-system.md, section 4.6).
- Skeleton pulse is static under reduced motion.

---

## 10. Content and microcopy

| Place | Text |
|---|---|
| Page title | Notifications |
| Intro | Renewals and payments that need your attention. |
| Unread line | {n} unread |
| Bell name | Notifications / Notifications, {n} unread |
| Mark all | Mark all as read |
| Dismiss (button) | Dismiss |
| Dismiss button name (for screen readers) | Dismiss: {title} |
| Show more | Show more |
| Loading more | Loading |
| Load more failed | We could not load more. Try again. |
| Page error title | We could not load your notifications |
| Page error body | Check your connection and try again. Your contracts are not affected. |
| Action error | We could not update your notifications. Try again. |
| Empty title | You are all caught up |
| Empty body | We will tell you here when a renewal, payment or contract end is coming up. Only you can see these. |
| Empty action | Review your contracts |

Rules: sentence case, no exclamation marks, no "Oops". "Dismiss" always means "hide from this list" and never "delete the contract".

---

## 11. Responsive behaviour

| Width | Navigation | List | Header | Dismiss placement |
|---|---|---|---|---|
| 375 px | Bottom nav, "Alerts" slot | Full width, 16 px gutter | Mark all full width under intro | Card footer, right |
| 768 px | Icon rail | Max 720 px, 24 px gutter | Mark all right of title | Card footer, right |
| 1280 px | Sidebar with counts | Max 720 px, 32 px gutter | Mark all right of title | Card footer, right |

- No horizontal scroll at any width. Long titles wrap to two lines and then truncate with `line-clamp-2`.
- Dates and amounts are `tabular-nums` and never wrap in the middle. The event line may wrap at the comma.
- Tap targets are at least 44 × 44 px: rows, Dismiss, Mark all, Show more, Try again.

---

## 12. Accessibility and contrast

| Pair | Light | Dark | Requirement | Result |
|---|---|---|---|---|
| Badge text `--primary-foreground` on `--primary` | 11.4:1 | 9.0:1 | 4.5 | Pass |
| "New" chip (same as the badge) | 11.4:1 | 9.0:1 | 4.5 | Pass |
| Unread left bar `--primary` on `--card` | high | high | 3 (non-text) | Pass |
| Title `--foreground` on `--card` | 16.0:1 | 15.1:1 | 4.5 | Pass |
| Event and added lines `--muted-foreground` on `--card` | about 7:1 | about 7:1 | 4.5 | Pass |
| Icon `--foreground` on `--muted` circle | high | high | 3 (meaningful icon, with text beside it) | Pass |
| Alert text `--destructive` on `--destructive-subtle` | about 6:1 | about 6:1 | 4.5 | Pass |

Checks for the reviewer:
- Every control is a labelled link or button, at least 44 px.
- The unread state has text ("New" and the accessible "Unread,"), not colour alone.
- The Dismiss button's name begins with the visible word "Dismiss" and then the title (for example "Dismiss: Car insurance renews"). That satisfies label-in-name.
- Focus order: bell, page header, Mark all, then each row's link and Dismiss, then Show more.

---

## 13. Components

### 13.1 Existing, used as they are

| Component | Used for |
|---|---|
| `HemCard` (`interactive`) | Each row. `space` is not used. |
| `Badge` (default) | The "New" chip. |
| `Button` (`outline`, `ghost`, `default`) | Mark all, Show more, Dismiss, Try again, Review your contracts. |
| `EmptyState` (`page`, `space="active"`) | The empty state. |
| `Skeleton` | Loading rows. |
| `SpaceBadge` (through `AppPageHeader`) | The active space in the page header. |
| `Logo`, `TopBar`, `BottomNav`, `SideNav`, rail | Shell, with the count badge in place. |

### 13.2 New, presentational

| Component | File | Props | Notes |
|---|---|---|---|
| `CountBadge` | `web/src/components/ui/count-badge.tsx` | `count`, `max` (default 9), `className` | Used in the top bar, bottom nav, rail and sidebar. Renders nothing at 0 or less. No logic beyond the cap. |

The shell's count badges (`top-bar.tsx`, `bottom-nav.tsx`, `side-nav.tsx`) still use "99+" and `--destructive` in the code. HEM-027 replaces those with `CountBadge` so they match this spec.

---

## 14. API field list (from HEM-026)

Source: `docs/backlog/HEM-026-api-notifications.md`. All routes are under `/api/v1/spaces/{space_id}/notifications` and need `require_space_member()`. A non-member gets 404. A row id that belongs to someone else gets 404.

### 14.1 Notification (one row in the list)

| Field | Type | Used for |
|---|---|---|
| `id` | UUID string | Keys, and the id in read and dismiss calls. |
| `space_id` | UUID string | Not shown (the URL carries it). |
| `contract_id` | UUID string | The link to `/contracts/{contract_id}`. |
| `type` | `payment_due` \| `renewal` \| `notice_deadline` \| `contract_end` | Icon and event label (section 6). |
| `event_date` | Date string `YYYY-MM-DD` | The date on the event line. Calendar date, no time zone. |
| `title` | String | The row title, as sent (N5). |
| `amount` | Decimal string, or null | The amount on the event line, when present. Never a number. |
| `currency` | ISO-4217 string, or null | With `amount`, for `sv-SE` formatting. |
| `read_at` | Timestamp (UTC), or null | Unread when null. |
| `dismissed_at` | Timestamp (UTC), or null | Always null in a list (dismissed rows are not listed). |
| `created_at` | Timestamp (UTC) | The "Added ..." line. |

Not sent to the UI: `user_id` (the caller's own rows only).

### 14.2 Routes

| Call | Response | UI use |
|---|---|---|
| `GET /notifications?cursor=&limit=` | `Page`: `items` (notification list) and `next_cursor` | The list, newest `created_at` first, non-dismissed rows only. The UI asks for `limit=20`. Show more uses `next_cursor`. |
| `GET /notifications/unread-count` | `{ "count": number }` | The bell badge and the "{n} unread" line. Counts rows with `read_at` null and `dismissed_at` null. |
| `POST /notifications/{id}/read` | 204 | Tap on a row (unread rows only). |
| `POST /notifications/read-all` | 204 | Mark all as read. |
| `POST /notifications/{id}/dismiss` | 204 | Dismiss, at once (no confirmation). |

The page size is 20 (PM decision Q5).

### 14.3 Errors

RFC 7807 problem+json, as elsewhere. The UI shows `title` and `detail` only in the inline alert. A 404 on a row (for example after another tab dismissed it) removes the row quietly and does not show an error.

---

## 15. PM decisions and open items

### 15.1 PM decisions (2026-11-27)

- **Q1. Titles are stable copy with no date** ("Car insurance renews"). The date goes on its own line. HEM-026 is updated to match. Applied in section 6.
- **Q2. Badge: "9+" in `--primary`.** HEM-027 swaps the inline badges in `top-bar.tsx`, `bottom-nav.tsx` and `side-nav.tsx` for `CountBadge`.
- **Q3. No dismiss confirmation.** Dismiss acts at once and moves focus to the next row, or to the heading if the list is empty. Applied in N8, 7.2, 7.4, 9.1, 13 and 14. Note: when the dismissed row was the last one, the spec moves focus to the previous row, since the PM did not name that case.
- **Q4. sv-SE helper.** HEM-027 uses the shared sv-SE helper once HEM-024 lands.
- **Q5. Unread count excludes dismissed rows, and the page size is 20.** Applied in 14.2.
- **Q6. Active space only (N4).** `app-shell.md` is updated to match.

### 15.2 Open item for HEM-027

- **Q7. Member removal.** HEM-026 deletes a removed member's rows in the same transaction as the removal. The UI needs no extra state: a removed member gets 404 on the notification routes, as for any space they cannot see. HEM-027 should check that this 404 follows the existing space-switch path, so the page does not show an error.
