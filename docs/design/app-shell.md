# HemFin App Shell

Status: v1 (HEM-002). Owner: Designer. Built by: HEM-003. Tokens, type and component states are in `design-system.md`.

The shell is the frame every signed-in screen sits in: a top bar with the space switcher, bottom navigation on phones, a sidebar from tablet width up, and a page header and empty-state pattern inside the content area. Wireframes are schematic. Widths are labelled, and they are not drawn to scale.

---

## 1. Breakpoints and layout modes

We design phone first and add layers as the screen gets wider. Tailwind names are in brackets.

| Width | Name | Layout | Navigation | Dialogs | Cards per row |
|---|---|---|---|---|---|
| 375 px | Phone (default) | Single column, 16 px gutter | Bottom nav (5 slots) + More sheet | Bottom sheets | 1 |
| 768 px | Tablet `md` | Icon rail (72 px) + content, 24 px gutter | Icon rail with tooltips | Centred dialogs | 2 |
| 1280 px | Desktop `xl` | Expanded sidebar (256 px) + content, 32 px gutter | Sidebar with labels and groups | Centred dialogs | 2 or 3 |

- Between 768 and 1279 px (for example, a landscape tablet) the icon rail stays. The expanded sidebar starts at 1280 px `xl`.
- The top bar is shown at every width. Its content changes slightly (see section 4).
- The bottom nav is hidden from `md` up. The icon rail is hidden below `md`.
- No layout may cause horizontal scrolling at 375, 768 or 1280 px.

---

## 2. App shell anatomy

```
+-----------------------------------------------------------+
|  Top bar  (space switcher, notifications)                 |  sticky, 56 px phone / 64 px md+
+=========================================================+|  2 px accent line = active space
|  Skip to content (visually hidden until focused)          |
|                                                           |
|  Main content (page header, then page body)               |  scrolls
|                                                           |
+-----------------------------------------------------------+
|  Bottom nav (phone only, 64 px + safe-area inset)         |  fixed
+-----------------------------------------------------------+
```

Rules:
- The top bar is `position: sticky; top: 0` and has a 1 px `--border` bottom edge. The 2 px accent line sits on the bottom edge and uses the active space's colour (`--personal` or `--household`).
- The bottom nav is `position: fixed; bottom: 0` on phones, with `padding-bottom: env(safe-area-inset-bottom)`. The page body adds matching bottom padding so content is never hidden behind it.
- Toasts sit 16 px above the bottom nav on phones.
- The main element is `<main id="main">`, and the first focusable element is a "Skip to content" link.
- Landmarks: `<header>` (top bar), `<nav aria-label="Main">` (bottom nav and sidebar), `<main>`.

### 2.1 Phone (375 px)

```
 PHONE 375 px
+--------------------------------------------------+
| [H] HemFin         [Lock Personal v]      (Bell) |  top bar 56 px
+==================================================+  <- 2 px Personal accent
|                                                  |
|  Dashboard                    [Lock Personal]    |  page header
|  Good morning, Sam.                              |
|                                                  |
|  [ + Add a contract                           ]  |  primary action, full width
|                                                  |
|  +--------------------------------------------+  |
|  | Next 30 days                               |  |  card
|  | EUR 1,240.00                               |  |  money-lg
|  | 3 payments due                             |  |  small text
|  +--------------------------------------------+  |
|                                                  |
|  Renewals                               See all  |
|  +--------------------------------------------+  |
|  | Car insurance                 3 Dec 2026 > |  |  list row
|  | EUR 4,350.00 a year                        |  |
|  +--------------------------------------------+  |
|                                                  |
+--------------------------------------------------+
| [icon]      [icon]     [icon]     [icon]  [icon] |  bottom nav 64 px
| Dashboard  Contracts  Reports    Alerts    More  |
+--------------------------------------------------+
```

### 2.2 Tablet (768 px)

```
 TABLET 768 px
+----------------------------------------------------------------------+
| [H] HemFin                                [Lock Personal v]   (Bell) |
+======================================================================+
|   [d]    |  Dashboard                                [Lock Personal] |
|          |  Good morning, Sam.                  [ + Add a contract ] |
|   [c]    |                                                           |
|          |  +-------------------------+  +-------------------------+ |
|   [e]    |  | Next 30 days            |  | Renewals                | |
|          |  | EUR 1,240.00            |  | Car insurance   3 Dec   | |
|   [i]    |  | 3 payments due          |  | EUR 4,350.00 a year     | |
|          |  +-------------------------+  +-------------------------+ |
|   [r]    |                                                           |
|          |  +-------------------------+  +-------------------------+ |
|   ...    |  | Recent expenses         |  | Suggestions             | |
|          |  | (empty state, inline)   |  | (empty state, inline)   | |
|          |  +-------------------------+  +-------------------------+ |
|          |                                                           |
+----------+-----------------------------------------------------------+
  rail 72 px: icons only, tooltip and aria-label on each item
```

### 2.3 Desktop (1280 px)

```
 DESKTOP 1280 px
+--------------------------------------------------------------------------------------------------+
| HemFin                                                        [Lock Personal v]          (Bell)  |
+==================================================================================================+
| Overview                 |  Dashboard                                            [Lock Personal] |
|  Dashboard               |  Good morning, Sam.                              [ + Add a contract ] |
|  Alerts (3)              |                                                                       |
| Money                    |  +------------------------------+   +------------------------------+  |
|  Contracts               |  | Next 30 days                 |   | Renewals                     |  |
|  Expenses                |  | EUR 1,240.00                 |   | Car insurance     3 Dec 2026 |  |
|  Income                  |  | 3 payments due               |   | EUR 4,350.00 a year          |  |
|  Reports                 |  +------------------------------+   +------------------------------+  |
|  Documents               |                                                                       |
| Insights                 |  +------------------------------+   +------------------------------+  |
|  Suggestions             |  | Recent expenses              |   | Suggestions                  |  |
|  Assistant               |  | (empty state, inline)        |   | (empty state, inline)        |  |
| Account                  |  +------------------------------+   +------------------------------+  |
|  Household               |                                                                       |
|  Profile                 |                                                                       |
|                          |                                                                       |
|                          |                                                                       |
+--------------------------+-----------------------------------------------------------------------+
  sidebar 256 px: group labels in text-caption, sentence case
```

---

## 3. Navigation

### 3.1 Full product navigation

All ten product items from the plan are listed, plus Notifications. Notifications is added because it has its own bottom-nav slot and an unread count.

| Key | Label | Route | Icon | Group (sidebar) | Phone | Tablet rail | Desktop sidebar |
|---|---|---|---|---|---|---|---|
| `dashboard` | Dashboard | `/` | `LayoutDashboard` | Overview | Bottom nav | Yes | Yes |
| `notifications` | Notifications | `/notifications` | `Bell` | Overview | Bottom nav, **label "Alerts"** | Yes | Yes, with unread count |
| `contracts` | Contracts | `/contracts` | `FileText` | Money | Bottom nav | Yes | Yes |
| `expenses` | Expenses | `/expenses` | `Receipt` | Money | More | Yes | Yes |
| `income` | Income | `/income` | `Banknote` | Money | More | Yes | Yes |
| `reports` | Reports | `/reports` | `BarChart3` | Money | Bottom nav | Yes | Yes |
| `documents` | Documents | `/documents` | `Paperclip` | Money | More | Yes | Yes |
| `suggestions` | Suggestions | `/suggestions` | `Lightbulb` | Insights | More | Yes | Yes |
| `assistant` | Assistant | `/assistant` | `MessageSquare` | Insights | More | Yes | Yes |
| `household` | Household | `/household` | `Users` | Account | More | Yes | Yes |
| `profile` | Profile | `/profile` | `CircleUser` | Account | More | Yes | Yes |

**Bottom nav (phone) has exactly five slots:** Dashboard, Contracts, Reports, Alerts (Notifications) and More. Everything else lives behind More.

**Why "Alerts" in the bottom nav:** at 375 px each slot is about 75 px wide. "Notifications" at 12 px does not fit on one line, and two-line labels look untidy. The full name "Notifications" is used in the page title, the sidebar, the rail tooltip and the accessible name. PM decision: keep "Alerts" on the phone bottom nav (section 11).

### 3.2 Bottom navigation (phone)

- Five equal slots, 64 px tall. Each slot is a button-sized target (at least 44 × 44 px; the whole slot is 75 × 64 px).
- Each slot shows an icon (24 px) above a label (12 px, medium weight).
- **Active state:** the icon sits on a `--accent` pill (32 × 24 px), the label is `--foreground` and bold, and the item has `aria-current="page"`. The pill and the bold label carry the state, so colour is not the only signal.
- **Inactive:** icon and label in `--muted-foreground`.
- **More:** opens a bottom sheet titled "More" with the seven items as 56 px rows (icon, label, and a chevron). The More button is active when the current route is one of the items in the sheet. The current item in the sheet gets the same active treatment as the bottom nav.
- The sheet also contains a "Sign out" row at the bottom, separated by a divider. It uses `--destructive` text only if it needs a confirmation.

```
 MORE sheet (phone, opened from the bottom nav)
+--------------------------------------------------+
|                    ____                          |  drag handle (decorative)
|  More                                       (X)  |
|--------------------------------------------------|
|  [icon]  Expenses                             >  |  56 px rows
|  [icon]  Income                               >  |
|  [icon]  Documents                            >  |
|  [icon]  Suggestions                          >  |
|  [icon]  Assistant                            >  |
|  [icon]  Household                            >  |
|  [icon]  Profile                              >  |
|--------------------------------------------------|
|  Sign out                                        |
+--------------------------------------------------+
```

### 3.3 Icon rail (tablet, 768 to 1279 px)
- 72 px wide, with items as 48 × 48 px icon buttons and a 4 px gap.
- A tooltip on hover and focus shows the full label. Each button has an `aria-label` with the full label.
- The active item has an `--accent` background and a 2 px `--primary` bar on its left edge.
- If the items do not fit the height, the rail scrolls inside itself. The page does not scroll sideways.
- The Notifications item shows an unread count as a small badge (`--primary` fill, `--primary-foreground` text, minimum 20 px, capped at "9+"). Rules and component: `notifications.md`, section 3.

### 3.4 Sidebar (desktop, 1280 px and up)
- 256 px wide. Group labels are `text-small` in `--muted-foreground`, with 24 px before each group.
- Items are 44 px tall with a 20 px icon and a `text-body` label.
- Active item: `--accent` background, `--accent-foreground` text, and a 2 px `--primary` bar on the left edge. The item has `aria-current="page"`.
- The Notifications item shows its unread count on the right.
- The sidebar does not show the space switcher (the top bar always has it, so there is one place to switch). It does show a short line at the bottom for the active space's name and role, for example "Household owner", as a reminder of the context.

### 3.5 Active route rule
A nav item is active when `currentPath === href`, or when `href !== "/"` and `currentPath` starts with `href + "/"`.

---

## 4. Top bar and space switcher

### 4.1 Top bar contents (left to right)

| Position | Phone (375) | Tablet (768) | Desktop (1280) |
|---|---|---|---|
| Left | HemFin logo mark (24 px) | Logo mark + wordmark, next to the rail | Logo mark + wordmark, above the sidebar |
| Centre | Empty | Empty | Empty |
| Right | Space switcher (compact), Notifications bell | Space switcher (full), Notifications bell | Space switcher (full), Notifications bell |

- Phone top bar: 56 px tall. The space switcher uses the compact variant.
- Notifications bell: 44 × 44 px button with `aria-label` "Notifications" plus the unread count, for example "Notifications, 3 unread". The count is a `CountBadge` in `--primary`, capped at "9+" (`notifications.md`, sections 2 and 3).
- No search in HEM-002. The top bar leaves space for a search button in a later phase.

### 4.2 Space switcher

The space switcher is the most important control in the shell. It is always visible, it is always labelled, and it always tells the user whose money they are looking at.

**Trigger (pill button)**
- Height 44 px. Padding 8 px vertically and 12 px horizontally. `rounded-full`. 1 px `--border` outline.
- Fill: `--personal-subtle` for personal, `--household-subtle` for household.
- Content: space icon (`Lock` or `Users`, 16 px, in the accent colour), the space name, and a chevron down (16 px).
- Phone compact variant: the name is truncated after 14 characters with an ellipsis. The full name is shown in the menu.
- Accessible name: "Active space: Personal. Switch space." (or the household name).

**Menu**
- Desktop and tablet: a dropdown menu, 280 px wide, aligned to the trigger's right edge.
- Phone: a bottom sheet titled "Switch space".
- Heading row (not clickable): space badge with the text "Personal" or, for a household, the household name (as in 4.3). Aligned to `households.md` D13 in HEM-014.
- One row per space, at least 44 px tall: space icon, name, role in meta text (for example "Owner", "Member"), and a check mark on the active space. Use `role="menuitemradio"` and `aria-checked`.
- Footer: two links, "Manage households" (`/household`) and "Create a household" (`/household/new`, `createHouseholdHref`), each at least 44 px tall (`households.md` D14, built in HEM-015).
- Keyboard: the switcher is a menu with no focus trap (`households.md` 6.9). Tab closes it and moves on; Escape or selecting returns focus to the trigger.

**Behaviour**
- Selecting a space changes the accent line, the trigger fill and the badges immediately.
- The current page stays the same. The user is not sent back to the dashboard.
- **Exception (HEM-014, PM decision):** on a household page (`/household/[spaceId]/...`), the page is bound to the household in its URL. Choosing a different space opens that space's dashboard (`/dashboard`), so a household's pages never show another space's name in the badge. Choosing the same space keeps the page. See `households.md` D21.
- While the new space's data loads, page content shows skeletons. It never shows the previous space's numbers under the new space's badge.
- The active space is kept in a cookie (for example `hemfin-space`) so server components render the right space first time. PM decision: the active space is stored in the `hemfin-space` cookie.

**Edge cases**
- The user has only a personal space: the menu shows the personal space and a "Create a household" item. The trigger still shows the badge, so the personal space is visibly labelled.
- The user was removed from the active household while viewing it: the shell switches to personal and shows a toast, "You no longer have access to [name]."

### 4.3 SpaceBadge

Used in the top bar, page headers, forms, cards and lists to label whose data it is.

| Size | Height | Text | Icon | Use |
|---|---|---|---|---|
| `sm` | 24 px | `text-caption` | 12 px | Inside list rows and cards |
| `md` | 28 px | `text-small`, medium | 16 px | Page headers and form headers |

- Personal: `Lock` icon, text "Personal", `--personal` text on `--personal-subtle`.
- Household: `Users` icon, text is the household name (or "Household" when no name is set), `--household` text on `--household-subtle`.
- Never colour alone. Always icon plus text.

---

## 5. Page header pattern

Every page starts with a PageHeader. It sets the title, says whose data the page shows, and offers the page's main action in a consistent place.

```
 PHONE (375 px)
  < Contracts                                      <- back link (detail pages only)
  Car insurance                                    <- h1, text-h1
  [Lock Personal]                                  <- SpaceBadge md
  Home and car policies, one line each.            <- description, text-lead, max 2 lines
  [ Edit contract                               ]  <- primary action, full width
  [ ... ]                                          <- secondary actions in a menu

 DESKTOP (1280 px)
  Contracts                 [Lock Personal]                  [ + Add a contract ]  [ ... ]
  Home and car policies, one line each.
  Breadcrumb (detail pages only): Contracts / Car insurance
```

Rules:
- **Title:** `text-h1`, sentence case. One `h1` per page.
- **Space badge:** shown on any page whose data belongs to one space. Not shown on Profile or the landing page. Shown on Notifications too, for the active space (`notifications.md`, N4).
- **Description:** optional, `text-lead` in `--muted-foreground`, maximum two lines.
- **Actions:**
  - Phone: the primary action is a full-width button below the description. Secondary actions go in a "..." menu button (44 × 44 px). Never a floating action button, because it would collide with the bottom nav.
  - Desktop: the primary action is right-aligned on the title row. Secondary actions are shown as ghost buttons next to it, or in the "..." menu when there are more than two.
- **Back link:** detail pages show "< [parent]" above the title on phone, and a breadcrumb on desktop.
- **Spacing:** 16 px between the header and the page body on phone; 24 px from `md` up.

---

## 6. Empty-state pattern

Every list, table and dashboard card has an empty state. A screen never shows a blank area. Each page has one clear next action. When several cards on the same page would lead to the same action (for example "Add a contract" on the dashboard), only the page header shows the button and the cards show text only, so the action is not repeated (PM decision, HEM-003).

```
 PAGE EMPTY STATE (phone 375 px)
+--------------------------------------------------+
|                                                  |
|                     ( icon )                     |  56 px circle, space-subtle fill, icon in space accent
|                                                  |
|            No contracts yet                      |  text-h3, centred
|                                                  |
|     Add insurance, subscriptions and bills in    |  text-body, max 36 characters per line
|     one place. We will remind you before each    |
|     one renews.                                  |
|                                                  |
|          [ Add a contract                    ]   |  primary button, full width on phone
|                                                  |
|          Learn how reminders work                |  optional text link, text-small
|                                                  |
+--------------------------------------------------+

 PAGE EMPTY STATE (desktop 1280 px)
+----------------------------------------------------------------------+
|                               ( icon )                               |
|                                                                      |
|                           No contracts yet                           |
|                                                                      |
|         Add insurance, subscriptions and bills in one place.         |
|              We will remind you before each one renews.              |
|                                                                      |
|                          [ Add a contract ]                          |
|                                                                      |
|                       Learn how reminders work                       |
+----------------------------------------------------------------------+
```

Rules:
- **Variants:** `page` (the whole content area, as above) and `inline` (inside a card or a section, left-aligned, with a 40 px icon and no separate heading row).
- **Content:** one title (at most 4 words), one or two sentences that say what the area is for and why it is worth filling, one primary action, and an optional secondary text link.
- **Tone:** invite, do not apologise. No "Oops" and no exclamation marks.
- **Privacy:** when the empty state is for a household area, it says who can see what.

Examples (copy is final for HEM-003 placeholders):

| Screen | Title | Body | Primary action | Secondary |
|---|---|---|---|---|
| Contracts | No contracts yet | Add insurance, subscriptions and bills in one place. We will remind you before each one renews. | Add a contract | Learn how reminders work |
| Expenses | No expenses this month | Record one-off payments to see where the money goes. | Add an expense | None |
| Household (no members) | Share your finances with family | Invite a partner or family member by email. They see only what you share. | Invite a member | None |
| Notifications | You are all caught up | We will tell you here when a renewal or payment is coming up. | Review your contracts | None |
| Dashboard, suggestions card | No suggestions yet | Suggestions appear once we have a few months of contracts and expenses. | Add a contract | None |

---

## 7. Sign-in page

Used by `/sign-in` and, later, the sign-up and reset pages, which reuse the same layout. HEM-003 builds this as a placeholder form with no working auth.

### 7.1 Phone (375 px)

```
+--------------------------------------------------+
|                                                  |
|                 [H] HemFin                       |  logo, centred
|                                                  |
|  Sign in                                         |  text-h1
|  Your personal finances stay private.            |  text-lead
|  Household finances are shared only with         |
|  the family members you invite.                  |
|                                                  |
|  Email                                           |  label above input
|  [ name@example.com                           ]  |  44 px input, 16 px text
|                                                  |
|  Password                                        |
|  [ ********                                   ]  |
|                                 Forgot password? |  text link, right
|                                                  |
|  [ Sign in                                    ]  |  primary, full width
|                                                  |
|  ------------------  or  ------------------      |
|                                                  |
|  [ G  Continue with Google                    ]  |  secondary, full width
|                                                  |
|  New to HemFin? Create an account                |
|                                                  |
+--------------------------------------------------+
```

### 7.2 Tablet (768 px)

```
+----------------------------------------------------------------------+
|                              [H] HemFin                              |
|                                                                      |
|          +------------------------------------------------+          |
|          | Sign in                                        |          |
|          | Your personal finances stay private.           |          |
|          | Household finances are shared only with        |          |
|          | the family members you invite.                 |          |
|          |                                                |          |
|          | Email                                          |          |
|          | [ name@example.com                    ]        |          |
|          | Password                                       |          |
|          | [ ********                        ]            |          |
|          |                               Forgot password? |          |
|          |                                                |          |
|          | [ Sign in                              ]       |          |
|          |                                                |          |
|          | ----------------- or -----------------         |          |
|          |                                                |          |
|          | [ G  Continue with Google              ]       |          |
|          +------------------------------------------------+          |
|                                                                      |
|                   New to HemFin? Create an account                   |
+----------------------------------------------------------------------+
```

### 7.3 Desktop (1280 px)

```
+------------------------------------------------------------------------------------------+
| [H] HemFin                                                                               |
+------------------------------------------+-----------------------------------------------+
|                                          |                                               |
| Household finances,                      | Sign in                                       |
| calm and in one place.                   | Your personal finances stay private.          |
|                                          | Household finances are shared only with       |
| Personal money stays personal.           | the family members you invite.                |
| Share a household with family only       |                                               |
| when you choose.                         | Email                                         |
|                                          | [ name@example.com                  ]         |
| - Contracts and renewal reminders        | Password                                      |
| - Expenses and income, any currency      | [ ********                         ]          |
| - Shared household view, by invite       |                         Forgot password?      |
|                                          | [ Sign in                           ]         |
|                                          | ------------ or ------------                  |
|                                          | [ G  Continue with Google           ]         |
|                                          | New to HemFin? Create an account              |
|                                          |                                               |
+------------------------------------------+-----------------------------------------------+
```

Rules:
- Phone and tablet: one column, the form is the main content. Tablet caps the form at 440 px wide and centres it.
- Desktop: a two-column split. The left panel is brand copy on `--card` with a 1 px `--border` edge (not a coloured block). The right column holds the form, 400 px wide.
- Labels are always visible above their inputs. Inputs use `autocomplete="email"` and `autocomplete="current-password"`.
- Errors show under the field in `--destructive`, with an icon. Example: "Enter the email you signed up with."
- The "Continue with Google" button follows Google's branding guidelines (their logo, their label, a neutral background). It is never restyled as a HemFin button.
- Invitation sign-in (from the Phase 2 accept page): the invitation token must be carried through the sign-in and sign-up forms. The layout does not change, but the page can show a one-line banner above the form: "You were invited to [household name]. Sign in with [email] to accept."
- The privacy line under the heading is fixed copy (PM decision): "Your personal finances stay private. Household finances are shared only with the family members you invite." It wraps to three lines on phone and two or three on desktop. Do not shorten it.

---

## 8. Landing page

Public page at `/`, shown to signed-out visitors. It does not use the app shell (no bottom nav, no sidebar). It has a minimal header with "Sign in" and "Create an account", a hero, three feature points, and a footer that shows the API status badge.

### 8.1 Phone (375 px)

```
+--------------------------------------------------+
| [H] HemFin                 Sign in   [Create]    |  header 56 px, text links and a small button
+--------------------------------------------------+
|                                                  |
|  Household finances,                             |  text-display, 32 px
|  calm and in one place.                          |
|                                                  |
|  Track contracts, expenses and income, and       |  text-lead
|  see what renews next. Keep personal money       |
|  private, and share a household when you want.   |
|                                                  |
|  [ Create a free account                      ]  |  primary, full width
|  [ Sign in                                    ]  |  secondary, full width
|                                                  |
|  +--------------------------------------------+  |
|  | Personal stays private                     |  |  feature card, icon + title + one sentence
|  | Only you see your personal records.        |  |
|  +--------------------------------------------+  |
|  +--------------------------------------------+  |
|  | Share a household                          |  |
|  | Invite family by email. They see only      |  |
|  | what you choose to share.                  |  |
|  +--------------------------------------------+  |
|  +--------------------------------------------+  |
|  | Never miss a renewal                       |  |
|  | Get a reminder before a contract renews    |  |
|  | or a notice period ends.                   |  |
|  +--------------------------------------------+  |
|                                                  |
+--------------------------------------------------+
|  HemFin  ·  API status: online   Privacy  Terms  |  footer, text-small
+--------------------------------------------------+
```

The API status badge is a small pill: a dot plus the words "API status: online", "API status: offline" or "API status: checking". Its colour is `--success-subtle` or `--destructive-subtle` with text, and the word always appears. If the API cannot be reached, the page still renders and the badge says "offline". HEM-003 implements the check.

### 8.2 Tablet (768 px)

```
+----------------------------------------------------------------------+
| [H] HemFin                                Sign in   [Create account] |
+----------------------------------------------------------------------+
|                                                                      |
|              Household finances, calm and in one place.              |
|      Track contracts, expenses and income, and see what renews.      |
|                                                                      |
|               [ Create a free account ]   [ Sign in ]                |
|                                                                      |
| +------------------------------+    +------------------------------+ |
| | Personal stays private       |    | Share a household            | |
| | Only you see your records.   |    | Invite family by email.      | |
| +------------------------------+    +------------------------------+ |
|                                                                      |
|                   +------------------------------+                   |
|                   | Never miss a renewal         |                   |
|                   | Reminders before renewals.   |                   |
|                   +------------------------------+                   |
|                                                                      |
+----------------------------------------------------------------------+
| HemFin  /  API status: online                         Privacy  Terms |
+----------------------------------------------------------------------+
```

### 8.3 Desktop (1280 px)

```
+--------------------------------------------------------------------------------------------------+
| [H] HemFin                                                         Sign in      [Create account] |
+--------------------------------------------------------------------------------------------------+
|                                              |                                                   |
| Household finances,                          | +-----------------------------------------+       |
| calm and in one place.                       | |                                         |       |
|                                              | |  Product preview (static, anonymised,   |       |
| Track contracts, expenses and income,        | |  light and dark variants)               |       |
| and see what renews next. Keep personal      | |                                         |       |
| money private. Share a household when        | +-----------------------------------------+       |
| you want to.                                 |                                                   |
|                                              |                                                   |
| [ Create a free account ]  [ Sign in ]       |                                                   |
|                                              |                                                   |
+--------------------------------------------------------------------------------------------------+
|  +----------------------------+  +----------------------------+  +----------------------------+  |
|  | Personal stays private     |  | Share a household          |  | Never miss a renewal       |  |
|  | Only you see your records. |  | Invite family by email.    |  | Reminders before renewals. |  |
|  +----------------------------+  +----------------------------+  +----------------------------+  |
+--------------------------------------------------------------------------------------------------+
| HemFin  /  API status: online                                                    Privacy   Terms |
+--------------------------------------------------------------------------------------------------+
```

Rules:
- Hero text is `text-display` on phone and `text-display` at 48 px on desktop (the token scales up at `md`). The hero has at most one headline and one lead paragraph.
- The primary CTA is "Create a free account". "Sign in" is secondary.
- The preview image is a static, anonymised screenshot. It must not show real people, names or amounts from a real account, and it must work in both themes.
- The three feature points use the same card component as the rest of the app (`HemCard`, `default` variant), so the landing page is not a separate visual style.
- No stock photos, no emoji, no animated hero. Motion is limited to the page's normal hover states.

---

## 9. Responsive checklist (used for every screen)

Designer and reviewer check each of these at 375, 768 and 1280 px:

- [ ] No horizontal scroll. Check `document.documentElement.scrollWidth <= clientWidth`.
- [ ] Bottom nav at 375 px only; icon rail at 768 to 1279 px; sidebar at 1280 px and up.
- [ ] Every tap target is at least 44 × 44 px.
- [ ] Tables become card lists at 375 px. Money stays right-aligned in both.
- [ ] Dialogs are bottom sheets at 375 px and centred dialogs from 768 px.
- [ ] The space badge and the 2 px accent line are visible and match the active space.
- [ ] Every list, table and card has an empty state, a loading state (skeleton) and an error state.
- [ ] Focus rings are visible in both themes.
- [ ] The page works with `prefers-reduced-motion` (no slides, no pulsing).

---

## 10. Hand-off to HEM-003: components and props

HEM-003 builds these in `web/src/components/layout/` (shell and navigation) and `web/src/components/ui/` (generic components). They are presentational. They take props only and do no data fetching. Page-level wiring (for example, reading the active space from the cookie) happens in the `(app)` layout.

Shared types go in `web/src/components/layout/types.ts`.

```ts
// web/src/components/layout/types.ts
import type { LucideIcon } from "lucide-react";
import type { ReactNode } from "react";

export type SpaceType = "personal" | "household";

export interface SpaceSummary {
  id: string;                          // UUID from the API
  name: string;                        // "Personal", or the household name
  type: SpaceType;
  role?: "owner" | "admin" | "member"; // shown as meta text in the switcher
}

export type NavKey =
  | "dashboard"
  | "notifications"
  | "contracts"
  | "expenses"
  | "income"
  | "reports"
  | "documents"
  | "suggestions"
  | "assistant"
  | "household"
  | "profile";

export type NavGroup = "overview" | "money" | "insights" | "account";

export interface NavItem {
  key: NavKey;
  label: string;                       // full label, for example "Notifications"
  shortLabel?: string;                 // bottom-nav label, for example "Alerts"
  href: string;                        // route, for example "/contracts"
  icon: LucideIcon;
  group: NavGroup;                     // sidebar grouping
  placement: "bottom" | "more";        // phone placement (bottom nav or More sheet)
  badgeCount?: number;                 // unread count, shown on Notifications only
}
```

`NAV_ITEMS` (all 11 items, display order) and the bottom-nav and More splits are constants in `web/src/components/layout/nav-items.ts`. HEM-003 creates them from section 3.1.

```ts
// web/src/components/layout/app-shell.tsx
export interface AppShellProps {
  children: ReactNode;
  spaces: SpaceSummary[];
  activeSpaceId: string;
  onSpaceChange: (spaceId: string) => void;
  navItems: NavItem[];                 // all items, display order
  currentPath: string;                 // from usePathname() in the caller
  notificationCount?: number;
  createHouseholdHref?: string;        // default "/household/new"
}
```

```ts
// web/src/components/layout/top-bar.tsx
export interface TopBarProps {
  spaces: SpaceSummary[];
  activeSpaceId: string;
  onSpaceChange: (spaceId: string) => void;
  notificationCount?: number;          // shows a badge when > 0
  notificationsHref: string;           // "/notifications"
  createHouseholdHref?: string;
}
```

```ts
// web/src/components/layout/space-switcher.tsx
export interface SpaceSwitcherProps {
  spaces: SpaceSummary[];
  activeSpaceId: string;
  onSelect: (spaceId: string) => void;
  createHouseholdHref?: string;
  variant?: "default" | "compact";     // compact on phone: name truncated at 14 characters
}
```

```ts
// web/src/components/layout/bottom-nav.tsx
export interface BottomNavProps {
  items: NavItem[];                    // placement === "bottom" (4 items)
  moreItems: NavItem[];                // placement === "more" (7 items), shown in the More sheet
  currentPath: string;
  notificationCount?: number;
}
```

```ts
// web/src/components/layout/side-nav.tsx
export interface SideNavProps {
  items: NavItem[];                    // all items, grouped by `group`
  currentPath: string;
  // Rail (md) vs expanded (xl) is CSS only, so there is no variant prop.
}
```

```ts
// web/src/components/layout/page-header.tsx
export interface PageHeaderProps {
  title: string;                       // renders as h1
  description?: string;                // max two lines
  space?: SpaceType;                   // renders a SpaceBadge when set
  spaceName?: string;                  // household name for the badge
  backLink?: { label: string; href: string };        // phone back link
  breadcrumbs?: { label: string; href?: string }[];  // md and up only
  primaryAction?: ReactNode;           // full width on phone
  secondaryActions?: ReactNode;        // collapsed into a "..." menu on phone
}
```

```ts
// web/src/components/ui/space-badge.tsx
export interface SpaceBadgeProps {
  type: SpaceType;
  label: string;                       // "Personal" or the household name
  size?: "sm" | "md";                  // 24 px or 28 px tall
}
```

```ts
// web/src/components/ui/empty-state.tsx
type EmptyStateAction =
  | { label: string; href: string; onClick?: never }
  | { label: string; onClick: () => void; href?: never };

export interface EmptyStateProps {
  icon: LucideIcon;
  title: string;                       // at most 4 words
  description: string;                 // one or two sentences
  primaryAction: EmptyStateAction;
  secondaryAction?: { label: string; href: string };
  space?: SpaceType;                   // tints the icon circle with the space accent
  variant?: "page" | "inline";         // default "page"
}
```

```ts
// web/src/components/ui/hem-card.tsx
export interface HemCardProps extends React.HTMLAttributes<HTMLDivElement> {
  variant?: "default" | "interactive" | "muted";  // interactive: hover border, link-like
  space?: SpaceType;                              // optional 2 px accent on the left edge
  padding?: "default" | "none";                   // default 16 px phone, 20 px md+
}
```

```ts
// web/src/components/ui/money-text.tsx
export interface MoneyTextProps {
  amount: string;                      // decimal string from the API, never a float
  currency: string;                    // ISO-4217, for example "EUR"
  locale?: string;                     // from profile, default "en"
  size?: "sm" | "md" | "lg";           // text-money, text-money (16 px), text-money-lg
  tone?: "default" | "muted" | "warning" | "destructive";
  showCode?: boolean;                  // "EUR 1,240.00" instead of "€1,240.00"
  signDisplay?: "auto" | "always" | "exceptZero";  // "+" for income is set by the caller
  caption?: string;                    // text-small under the amount, for example "Income"
  className?: string;
}
```

```ts
// web/src/components/layout/auth-layout.tsx
export interface AuthLayoutProps {
  children: ReactNode;                 // the form
  title: string;                       // h1
  description?: string;
  banner?: string;                     // for example an invitation notice
  brandPanel?: boolean;                // true on desktop only, split layout
}
```

Build notes for HEM-003:
- Use Next.js `Link` for every `href`, and `aria-current="page"` on the active item.
- The More sheet and the space switcher menu are Radix-based shadcn components (Sheet and DropdownMenu). On phone, the switcher uses a Sheet.
- Icon-only buttons (rail, bell, "...") need `aria-label`s.
- Provide `loading.tsx` skeletons for the `(app)` layout so the shell renders before data arrives.
- Playwright (HEM-003) checks: bottom nav visible at 375 and hidden at 1280, sidebar visible at 1280 and hidden at 375, `scrollWidth <= clientWidth` everywhere.

---

## 11. Open questions for the PM

PM decisions, all resolved:

1. **Bottom-nav label.** Keep "Alerts" for Notifications on the phone bottom nav.
2. **Notifications in the nav.** Keep Notifications in the nav alongside the ten product items.
3. **Tailwind version.** Tailwind CSS v4 with current shadcn/ui. The HSL values are unchanged, written as full `hsl()` values on `:root` and `.dark` and mapped through `@theme inline` in `globals.css`. There is no `tailwind.config`.
4. **Space persistence.** The active space is stored in the `hemfin-space` cookie.
5. **Sign-in copy.** "Your personal finances stay private. Household finances are shared only with the family members you invite."

Still open for a later phase: the Assistant placement. It stays under More until Phase 9, when it can be promoted to the bottom nav in place of Reports.
