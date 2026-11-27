# Core finance: contracts, expenses, income and dashboard (HEM-017)

Status: v1.1 (HEM-017, PM decisions applied, review round 1 fixes applied; see the handoff log). Owner: Designer. Built by: HEM-021 (contracts), HEM-022 (expenses and income), HEM-023 (dashboard).
Related: `design-system.md` (tokens, type, money rules in section 5, dialogs and states), `app-shell.md` (shell, page header, empty-state pattern, space badge), `households.md` (form, dialog and section-link patterns, the `Field` and `FormMessage` usage).
API source: HEM-018 (categories, contracts, schedule), HEM-019 (expenses, income), HEM-020 (FX), HEM-023 (dashboard). Field names are in section 11.

Example data in this spec is fictional. People are Alex, Jordan and Sam, the household is "The Lee family", and providers and merchants are invented. Addresses use `example.com`. Amounts are examples only.

---

## 1. Purpose and scope

HemFin's core money screens: a user records what they pay (contracts and one-off expenses), what they receive (income), and sees what is coming up and what it adds up to (dashboard). Most users are not finance experts, so every screen answers one plain question:

| Screen | Question it answers | Route |
|---|---|---|
| Contracts | What do I pay for regularly, and when does it renew? | `/contracts`, `/contracts/[id]` |
| Expenses | Where did the money go? | `/expenses` |
| Income | What came in, and from where? | `/income`, `/income/sources` |
| Dashboard | Where do things stand this month, and what is due soon? | `/dashboard` |

Shared building blocks are in section 3: money input and display, converted amounts, category, frequency and "applies to" pickers, dates, due-date chips, and the form and confirmation patterns.

Out of scope for this spec: reports (a later phase), documents attached to records, FX rate management (an internal job, HEM-020), notifications (Phase 5), and the category management screen (a board follow-up, see Q4 in section 13).

---

## 2. Decisions in this spec

These decisions let HEM-021, HEM-022 and HEM-023 start without a design round trip. The PM's decisions on the open questions are in section 13.

| # | Decision | Why |
|---|---|---|
| F1 | Amounts are decimal strings from the API and stay strings in the UI. Amount inputs are `type="text"` with `inputMode="decimal"`, never `type="number"`. The text is parsed on submit (3.1). | `design-system.md` 5, rules 1 and 2. A number input rewrites the value in the browser's locale and can lose digits. |
| F2 | Each record stores its own currency. The currency select defaults to the space's base currency (the profile's `base_currency`). | A record can be paid in another currency, for example a SEK subscription, so the currency belongs to the record. |
| F3 | The base-currency equivalent of a record is shown under its original amount, marked "About" (screen readers) and "≈" (sight). Totals are in the base currency only. When there is no rate, a list row shows the original amount only (no guess), and the dashboard hint says how many amounts are left out. Base amounts come from the API (Q1). | Keeps the original visible, and makes clear which total a record is in. |
| F4 | Every finance page has a `SpaceBadge` next to its title. Every form shows the badge in its header. "Applies to" appears only in a household space. | `app-shell.md` 2.4 and 5. The user always knows whose money it is. |
| F5 | Contracts default to the **Active** filter. Filters sit in a sheet on phone and in a row above the table from `md`. | Cancelled contracts are rarely wanted, and a filter row would crowd a 375 px screen. |
| F6 | Due-date thresholds (3.8): a payment or renewal within 7 days shows a warning chip. A notice deadline within 30 days shows "Notice deadline soon". A notice date already passed is neutral text, not an alarm. | Warnings that come too early become noise. The 7 and 30 day values are confirmed (Q3). |
| F7 | Create and edit forms use `ResponsiveDialog`: a bottom sheet on phone, a centred dialog from `md`. The body scrolls and the footer is pinned. They are not separate pages. | Keeps the list in view, matches `households.md` and `profile.md`. The long contract form scrolls inside the dialog. Confirmed for the contract form (Q7). |
| F8 | Form field `name` and `id` equal the API field name (`end_date`, `category_id`). Server errors from problem+json map back to fields by that name. | Field-level server validation needs no lookup table. |
| F9 | Quick add (expenses) shows four fields first: amount, category, date and the save button. Description and merchant are under "More details", collapsed. | "A few taps" on a phone. |
| F10 | Expense and income lists group by calendar month, using the date string (no time zone conversion). A month header shows the number of items. It shows a total only when the API returns one. The browser does not add up money. | Dates are calendar dates (HEM-018 design notes). Summing money in the browser would be business logic, and a sum over a page is wrong when the list is paged. |
| F11 | Destructive actions open an alert dialog naming the item and its consequence. The confirm button uses the action's name. "Cancel" is never a confirm label: contracts use "Mark as cancelled", and the dismiss button is "Keep contract". | `design-system.md` 7.1. "Cancel" is ambiguous when it can mean both "stop" and "go back". |
| F12 | Marking a contract as cancelled is reversible. The detail page offers "Make active again" when it is cancelled. Deleting a contract is not reversible and is confirmed. Linked expenses stay when a contract is deleted, and lose the link (the API sets `contract_id` to null). | Matches HEM-018 and HEM-019. The copy must say what happens to linked records. |
| F13 | Income shows a `+` sign and the word "Income" in meta text. Expenses show no sign and the word "Expense" where a label is needed. Colour is not used for direction. | `design-system.md` 5, rule 6. |
| F14 | An income source is paused with its "Active" checkbox, not deleted. A paused source stays in the list with a "Paused" badge. Deleting a source keeps its received payments, which lose the link (`source_id` null). | Income often stops and starts. Deleting history by accident would be costly. |
| F15 | Dashboard totals are in the base currency: "Spent this month", "Recurring cost" (monthly equivalent) and "Income this month". A hint appears when `unconverted_count` is above 0. | HEM-023. The totals must say what they leave out. |
| F16 | The dashboard first run (no contracts, expenses or income) is one page-variant empty state, with no zero totals. Zero totals would look like a broken page. | `app-shell.md` 6. |
| F17 | The dashboard's page header action is "Add an expense". On the first run the header has no action, because the empty state holds the actions. | Expenses are the most frequent record. Only one place shows the same button (`app-shell.md` 6). Confirmed (Q9). |
| F18 | A dialog with unsaved changes asks before it closes (Escape, outside tap or Cancel). | Stops an accidental loss of a long contract form. |
| F19 | Quick add pre-selects the category last used in this space by this user. The memory is a per-viewer convenience kept in `localStorage`, and it falls back to an empty placeholder. Date defaults to today in the user's time zone. | Saves a tap. The value is never shared or read back by the server. |
| F20 | Currency is shown as a symbol when it equals the base currency, and as a code when it differs (`design-system.md` 5.4, rule 4). | Multi-currency lists need the code to be readable. |
| F21 | The converted amount uses the code and the currency's minor units: "≈ SEK 1,234.00", not "≈ 1,234 SEK". | The design system asks for `Intl.NumberFormat` output, never client rounding, and a code prefix matches `MoneyText` with `showCode`. The ticket's example is illustrative. This format is confirmed (Q8). |
| F22 | Contract rows show the frequency in words ("EUR 4,350.00 a year"). The browser does not compute a per-contract monthly amount. The only monthly total is the API's `recurring_monthly`. | One source of truth for money totals. |
| F23 | Lists are read in order, newest date first. Each item is one row or card. Rows are not drag-sortable, and no bulk select is offered in this phase. | Keeps the screens calm and the scope small. |

---

## 3. Shared building blocks

### 3.1 Money input (`AmountInput`)

`AmountInput` (`web/src/components/ui/amount-input.tsx`) is an amount text field and a currency select on one row. The currency select sits to the right of the amount and has its own visible label, "Currency". The component always takes the full width of its form section (B4): it is never placed in a half-width column. The amount and currency stay side by side at every width. The currency select is 9 rem (144 px) and the amount takes the rest.

```
 PHONE 375 px, inside a sheet
  Amount                       Currency
  [ 12,50                 ]    [ EUR     v ]        <- row, 44 px tall controls
  Use , before the cents.                            <- hint, text-small
  Enter an amount greater than 0.                    <- error, under the amount field

 Server error on currency (422, field `currency`), 375 px, under the row
  [ 12,50                 ]    [ XYZ     v ]
  Use , before the cents.
  The currency is not supported.                     <- currency error, full width, under the row
```

Rules:
- **Keyboard.** `inputMode="decimal"` opens the decimal keypad on phones (it shows `,` or `.` according to the device locale). `autoComplete="off"`, `autoCorrect="off"`, `spellCheck={false}`.
- **Value.** The component keeps the raw text the user typed. It does not parse or format while typing. Nothing is reformatted under the cursor.
- **Currency options.** The closed select shows the ISO code only ("EUR", "SEK"), so the text fits the 9 rem column at every size (N6). The full currency name is not shown in this control. The list is the profile's currency list (HEM-009).
- **Where errors show.** An amount error (client or server on `amount`) appears under the amount field, and `aria-invalid` is set on the input. A currency error (server on `currency`, the only way the currency can be invalid, because the select offers only valid codes) appears under the whole row, at full width, and `aria-invalid` is set on the currency select. Both are linked with `aria-describedby`. Each message is a specific sentence from the server, or 3.1.1.
- **Required.** The amount input carries `aria-required`. The forms do not use the native `required` attribute, so the browser's own message does not compete with the inline errors (3.10).
- **Parsing (for the engineer, on submit).** Trim spaces. Accept only the locale's decimal mark: `.` in an English locale, `,` in a German or Swedish one. Digits only otherwise. Any other mark, a thousands separator, letters or signs are rejected with the message in 3.1.1. Nothing is reinterpreted silently. Convert the accepted text to a plain decimal string with a dot (`"12.50"`) before sending. Never pass the text through `Number()` or `parseFloat()`.
- **Examples (locale `en`, decimal mark `.`).**

  | Typed | Result |
  |---|---|
  | `12.50` | Accepted, sent as `"12.50"` |
  | `1250` | Accepted, sent as `"1250"` |
  | `12,50` | Rejected: "Enter an amount like 12.50." (`,` is not the decimal mark here) |
  | `1,250` | Rejected: "Enter an amount like 12.50." (a thousands separator, so it is not read as 1.25) |
  | `1 250` | Rejected: "Enter an amount like 12.50." |

  In a `de` locale the mark is `,`, so `12,50` is accepted and `1.250` and `12.50` are rejected with the same message.
- **Decimal places.** The number of decimals must not exceed the currency's minor units (EUR 2, JPY 0, and so on). Check this on submit with the selected currency.
- **Hint.** The default hint is "Use , before the cents." (or `.`, from the locale). For a currency with no minor units it is "Whole numbers only for this currency."
- **Currency default.** The base currency from the profile. The list of currencies is the one used by the profile (`Currency` type, HEM-009).

#### 3.1.1 Amount validation messages

| Rule | Message (under the field) |
|---|---|
| Empty | "Enter the amount." |
| Not a number, letters or signs; a second decimal mark; the other decimal mark (`,` in an English locale); a thousands separator | "Enter an amount like 12.50." (use the locale's decimal mark in the example) |
| Zero or below | "Enter an amount greater than 0." |
| Too many decimals, currency has 2 | "EUR amounts can have up to 2 decimal places." (replace EUR with the code) |
| Too many decimals, currency has 0 | "JPY amounts are whole numbers." |
| Server (problem+json, field `amount`) | Under the amount field. The server message, cleaned as in `profile/problem.ts`. |
| Server (problem+json, field `currency`) | Under the row, full width (`currencyError`). The server message, cleaned the same way. |

### 3.2 Money display (`MoneyText`)

`MoneyText` already exists (`web/src/components/ui/money-text.tsx`). Its props are in `design-system.md` section 7 and in the component. This spec adds the rules for its use on these screens.

| Situation | Props | Example |
|---|---|---|
| Amount in the record's own currency, which is the base currency | `size="md"`, currency from the record | `EUR 4,350.00` is shown as `€4,350.00` |
| Amount in a currency other than the base | `showCode` | `SEK 540.00` |
| Hero total on the dashboard | `size="lg"` | `€812.40` |
| Income | `signDisplay="always"` and meta text "Income" | `+€2,850.00` |
| Zero | default | `€0.00`, with meta text such as "Nothing recorded yet" |
| Negative (not expected in this scope, but the rule holds) | the Intl minus sign, plus text | `-€12.00` with the word "Refund" in meta text |

Rules:
- Pass `currency` and `locale` explicitly on every screen in this spec, including the dashboard totals. Record amounts take the record's flat `currency`. Computed Money values (the upcoming event amount, the dashboard totals, `base_amount`) carry their own currency (section 11). The context fallback in `MoneyText` is not used here.
- A zero is a value, not a dash. Show "€0.00" and a short meta line that says why.
- Amounts are `tabular-nums` and right-aligned in tables and in card lists (the amount sits on the right edge of the card).
- **No wrapping amounts (N12).** The amount element is `shrink-0 whitespace-nowrap`. The title block next to it is `min-w-0 flex-1`, so a long title clamps (two lines) and the amount never pushes the row wider than the screen. A long converted amount (3.3) takes the same rule.
- Never colour an amount for good or bad. `warning` tone is only for a due date chip, not the amount itself.

### 3.3 Converted amount (`ConvertedAmount`)

Shown under the original amount in list rows, detail views and the dashboard hint. Only when the record's currency differs from the base currency.

```
  Train tickets                    SEK 540.00
  Transport · 9 Nov 2026           ≈ EUR 48.11       <- converted, text-small, muted

  Coffee subscription              USD 9.00
  Subscriptions · 12 Nov 2026      (nothing: no rate, so no line)
                                   <- no line when base_amount is null
```

| State | What the user sees | Copy |
|---|---|---|
| Converted | `≈` (hidden from screen readers, which hear "About") and the base amount with its code. | "About EUR 48.11" |
| Null (`base_amount` is null) | Nothing under the original amount. The record stays in the list. This covers a missing rate and FX not yet built (Q1). `ConvertedAmount` returns nothing here (Q13). | none |
| Same currency | Nothing is rendered. | none |
| Loading | No placeholder. The base line appears with the record, because the API returns it with the record. | none |

Rules:
- The converted line is always smaller and muted, so the original amount stays the main figure.
- A null `base_amount` is not an error, so it gets no text. The browser never guesses a rate.
- The dashboard hint for unconverted amounts (7.1) is the only place that says which amounts are left out of the totals.

### 3.4 Category picker (`CategorySelect`)

A native select with one `optgroup` per parent category. The native picker is the best control on phones, and the groups keep a long list readable. The same component serves contracts, expenses and income.

| Form | Groups (in this order) | Empty option |
|---|---|---|
| Contract | Insurance, Utilities, Subscriptions, Memberships, Housing, Transport, Food, Health, Kids, Other, Your categories | "Choose a category" (disabled) |
| Expense | the same expense groups | "Choose a category" (disabled) |
| Filter (contracts or expenses) | the same groups | "All categories" (enabled, value empty) |

Income sources do not use categories. Their `type` (Salary, Business, Other) is a plain native select with three options, labelled "Type", default Salary. Income entries have no category.

Rules:
- Each option shows the category's `name` from the API (Q5). The UI keeps no label table. The API also returns `key` (for example `insurance.home`), which decides the group.
- "Your categories" holds the space's own categories. It appears only when the space has any. No screen in Phase 3 creates or renames a category (Q4), so the group only lists categories that already exist.
- The field is required in forms and shows "Choose a category." on a failed submit (see 3.10).
- Subcategories such as `insurance.home` and `insurance.car` appear under the parent group "Insurance", labelled "Home insurance" and "Car insurance".

### 3.5 Frequency picker (`FrequencySelect`)

A native select (`FREQUENCY_LABEL` in the component).

| Value | Option label | Amount phrase ("EUR 4,350.00 a year") |
|---|---|---|
| `weekly` | Weekly | a week |
| `monthly` | Monthly | a month |
| `quarterly` | Every 3 months | every 3 months |
| `semiannual` | Every 6 months | every 6 months |
| `annual` | Yearly | a year |
| `irregular` | Irregular (income sources only) | (no phrase) |

Default for a new contract: Monthly. Default for a new income source: Monthly.

### 3.6 Date fields

Use `Field` with `type="date"`. `Field` and `FieldError` move to `web/src/components/ui/` in HEM-021 (Q6). It gives a visible label, a hint and an error, with the correct `aria-describedby`. The browser's date picker is used on every platform.

| Field | Default | Rules | Message |
|---|---|---|---|
| Starts (contract) | today | required | "Enter the start date." |
| Ends (contract, optional) | empty | on or after the start date | "The end date must be on or after the start date." |
| Spent on (expense) | today | required | "Enter the date you paid." |
| Received on (income entry) | today | required | "Enter the date you received it." |
| From and To (filters) | empty | From on or before To | "The From date must be before the To date." |

Dates may be at most one day in the future. A later date gets "The date cannot be more than a day in the future." The API checks the same rule (HEM-019, Q10).

Dates are calendar dates. They are shown with `Intl.DateTimeFormat` as "3 Dec 2026" (`design-system.md` 5, rule 8). No time zone is involved, so a date never moves a day.

### 3.7 "Applies to" (`AppliesToSelect`)

A native select with "Whole household" first, then the space's members by display name.

- Shown only in a household space (F4). In a personal space the field is not rendered and the API value is null.
- Options use display names only. Email addresses never appear in a picker or a list row.
- Default: "Whole household" for a new record.
- In a list row, a record for one member shows "For Jordan" in meta text (household spaces only). A whole-household record shows nothing.

### 3.8 Due-date chips (`DueChip`)

`DueChip` (`web/src/components/ui/due-chip.tsx`) shows the status of a date. The caller picks the tone and the words from the date.

| Event | Condition | Tone | Words | Icon |
|---|---|---|---|---|
| Payment | next payment is within 7 days | `soon` | "Due in 6 days" (use "Due tomorrow" for 1, "Due today" for 0) | `Clock` |
| Payment | more than 7 days away | `later` (or no chip) | the date only | `CalendarDays` |
| Renewal | renewal is within 7 days | `soon` | "Renews in 6 days" | `Clock` |
| Notice deadline | 0 to 30 days away | `soon` | "Notice deadline soon" with "in 5 days" | `Clock` |
| Notice deadline | more than 30 days away | `later` | the date only | `CalendarDays` |
| Notice deadline | passed | neutral text, no chip | "Notice period passed on 2 Dec 2026" | none |
| Overdue | not reachable in this scope (the schedule rolls forward) | `overdue` | "Overdue" | `CircleAlert` |

Rules:
- The words always appear. The tone is never the only signal (`design-system.md` 1, 2.5).
- The "soon" tone uses `--warning` text on `--warning-subtle`. The "overdue" tone uses `--destructive` and is reserved for a later phase.
- The thresholds (7 and 30 days) are set by the caller so the engineer can change them in one place.

### 3.9 Space context

- Page header: `SpaceBadge` (`md`) under the title, with the space name (household name, or "Personal").
- Lists: no badge on each row (the page already says whose data it is). Rows show "For Jordan" only in a household (3.7).
- Forms: the badge sits in the dialog header under the title, so the user always sees where the record goes.
- The top bar accent line matches the active space (`app-shell.md` 2).
- The dashboard totals are the active space's totals. The badge is on the page header.

### 3.10 Form pattern

Used by every create and edit dialog in this spec.

**Layout.** A `ResponsiveDialog` with a title ("Add a contract", "Edit contract", "Add an expense", "Add income", "Add an income source"), the `SpaceBadge` under the title, and a body of `FormSection` groups. The footer holds the primary button (full width on phone) and a secondary "Cancel" text button. On phone the footer is pinned at the bottom of the sheet.

**Groups.** Each dialog groups its fields in `FormSection`s with a legend. Field order inside a group follows the order people fill them in.

**Labels.** Every field has a visible label above it. Optional fields say "(optional)" in the label text, so the required fields are the ones without it. No asterisks. Every optional picker in a form, including "Applies to", says "(optional)" (N9). Required controls carry `aria-required="true"` (N8). They do not use the native `required` attribute, and the forms use `noValidate`, so the browser does not show its own messages next to the inline errors.

**Validation.**
- Validate on blur and on submit, as `design-system.md` 7.1 says.
- Errors appear under the field with an icon and a specific sentence. Never "Invalid input".
- On a failed submit, focus moves to the first invalid field. (The `useFocusFirstInvalid` hook in `auth/form-parts.tsx` does this.)
- The error message is linked to the field with `aria-describedby`, and the field has `aria-invalid="true"`.

**Server errors (problem+json).** The client parses the response with the same logic as `profile/problem.ts`:
- `errors[]` with `loc` ending in a field name maps to that field's error. Field names are the API names (F8). Example: a 422 for a category from another space arrives with `loc` ending in `category_id`, and shows under the Category field.
- Amount fields map as follows. `amount` shows under the amount field. `currency` shows in the currency error slot of `AmountInput`, under the row (3.1).
- A 409 or any error with no field maps to a `FormMessage` (kind `error`) at the top of the body, with the server's `detail` when it is plain text.
- A network failure maps to "We could not reach the server. Check your connection and try again."
- The field keeps the user's value. Nothing is cleared on error.

**Submit.** The primary button shows its busy label ("Saving…", "Adding…", "Deleting…") at the same width and sets `aria-busy`. A second submit is ignored while busy. Escape and outside taps do not close a busy dialog.

**Unsaved changes (F18).** If the form is dirty and the user closes it (Escape, outside tap, Cancel, the close button), an alert asks: title "Discard changes?", body "Your changes to this contract are not saved.", buttons "Discard changes" (destructive) and "Keep editing" (focused first). If the form is not dirty, it closes at once.

**Success.** The dialog closes, the list updates, and a toast (16 px above the bottom nav on phone) says "Contract saved", "Expense added", "Income added" or "Source saved". Focus returns to the element that opened the dialog.

### 3.11 Destructive confirmations

Every destructive action uses `ResponsiveDialog` with `alert` (an alert dialog). The title names the item. The body says what happens. The confirm button uses the action's name and the `destructive` variant. The dismiss button is focused first.

| Action | Title | Body | Confirm | Dismiss |
|---|---|---|---|---|
| Mark a contract as cancelled | "Mark {name} as cancelled?" | "It stops showing payments and renewals. Its expenses stay in your list. You can make it active again from its page." | "Mark as cancelled" (default variant, not red, because it is reversible) | "Keep contract" |
| Delete a contract | "Delete {name}?" | "This removes the contract and its schedule. Expenses linked to it stay in your list, without the link." | "Delete contract" | "Keep contract" |
| Delete an expense | "Delete this expense?" | "{description or category}, {amount}, {date}. It cannot be undone." | "Delete expense" | "Keep expense" |
| Delete an income entry | "Delete this income?" | "{amount} from {date}. It cannot be undone." | "Delete income" | "Keep income" |
| Delete an income source | "Delete {name}?" | "Its received payments stay in your list, but they are no longer linked to this source. It cannot be undone." | "Delete source" | "Keep source" |
| Discard edits | "Discard changes?" | "Your changes are not saved." | "Discard changes" | "Keep editing" |

Rules:
- Deleting is reached from inside the edit dialog (expenses, income, sources) or from the detail page's "..." menu (contracts), never from a list row. The delete button is a text button in the destructive colour, separated from the save button by a divider.
- Busy: the confirm label becomes "Deleting…" and the dialog cannot be dismissed.
- Error: a `FormMessage` (kind error) inside the alert. The alert stays open and the user can try again.
- Success: the alert closes, and the page shows a toast ("Contract deleted", "Expense deleted", and so on). Focus moves to the list heading, not to a removed row.

---

## 4. Contracts

A contract is a recurring obligation: insurance, a utility, a subscription, a membership or another regular bill. Its schedule (next payment, renewal date and notice deadline) is computed by the API (HEM-018). The UI shows it and never computes it.

### 4.1 Contract list (`/contracts`)

**Purpose.** See every active contract, its amount, when it next renews, and whether a notice deadline is close.

**Phone 375 px**

```
 PHONE 375 px
+--------------------------------------------------+
| [H]        [Lock Personal v]              (bell)  |  top bar 56 px
+==================================================+  2 px Personal accent
| Contracts                                        |  h1
| [Lock Personal]                                  |  SpaceBadge md
| Insurance, subscriptions and bills.              |  text-lead
|                                                  |
| [ + Add a contract                           ]   |  primary, full width, 44 px
| [ Filters: Active, 1 more                    ]   |  outline, opens filter sheet
|                                                  |
| +----------------------------------------------+ |
| | Car insurance                            >   | |  HemCard interactive (link)
| | Harbor Insurance · Insurance, car            | |  text-small
| | EUR 4,350.00 a year                          | |  MoneyText md
| | Renews 1 Jan 2027                            | |
| | [Clock] Notice deadline soon, in 5 days      | |  DueChip soon
| +----------------------------------------------+ |
| +----------------------------------------------+ |
| | Music streaming                          >   | |
| | Lark Audio · Subscriptions                   | |
| | EUR 11.99 a month                            | |
| | Renews 14 Dec 2026                           | |
| | [Clock] Renews in 6 days                     | |  DueChip soon
| +----------------------------------------------+ |
|                                                  |
| [ Show more contracts                        ]   |  cursor pagination, 44 px
+--------------------------------------------------+
| Dashboard  Contracts  Reports  Alerts      More  |  bottom nav
+--------------------------------------------------+
```

**Desktop 1280 px.** Sidebar (256 px), content up to 1120 px. The page header has the title, the badge and the "Add a contract" button on the right. The header button is hidden in the empty state (N5, see States). A filter row sits above the table. Table columns: Contract, Category, Amount, Next payment, Renewal and notice. The table is a `DataTable`.

```
+-----------+--------------------------------------------------------------------------------+
| Money     | Contracts  [Lock Personal]                            [ + Add a contract ]     |
|  Contracts|                                                                                |
|  Expenses | Status [Active v]   Category [All categories v]   Applies to [All v]          |
|  Income   |                                                                                |
|  Reports  | +-----------------------+---------------+--------------+------------+--------+ |
|           | | Contract              | Category      | Amount       | Next pay.  | Renews | |
|           | +-----------------------+---------------+--------------+------------+--------+ |
|           | | Car insurance         | Insurance, car| EUR 4,350.00 | 3 Dec 2026 | 1 Jan  | |
|           | | Harbor Insurance      |               | a year       |            | 2027   | |
|           | |                       |               |              |            | [Clock]| |
|           | |                       |               |              |            | Notice | |
|           | |                       |               |              |            | soon   | |
|           | +-----------------------+---------------+--------------+------------+--------+ |
+-----------+--------------------------------------------------------------------------------+
```

**Components.** `PageHeader` (with `SpaceBadge`, primary action), `Button` (primary and outline), `HemCard` (`interactive`) on phone, `DataTable` and `ResponsiveList` (`design-system.md` 7), `MoneyText` (`md`), `DueChip`, `EmptyState` (`page`), `Skeleton`, `FormMessage` (error), `ResponsiveDialog` (filter sheet on phone, the create dialog), `NativeSelect` for the filters.

**Card content (in order).**
1. Name (`text-body-strong`, clamped to two lines). The whole card is one link to the detail page. Accessible name: "Car insurance, Harbor Insurance, EUR 4,350.00 a year".
2. Provider and category (`text-small`, muted). "Harbor Insurance · Insurance, car". The provider is omitted when empty.
3. Amount with the frequency phrase (`MoneyText` `md`, and "a year" in the same line). If the currency is not the base, the code is shown and the converted line appears under it (3.3).
4. Renewal date ("Renews 1 Jan 2027"). If `renewal_date` is null: "No renewal date" for a contract that ends or does not renew.
5. Next payment, when it is soon (DueChip). The notice deadline chip (`soon`) if within 30 days. A notice in the list shows only the chip, not the date. The date is in the detail view.
6. Applies to (household only): "For Jordan" in meta text, below the provider.

**Table columns.**

| Column | Shown from | Content | Alignment |
|---|---|---|---|
| Contract | all | Name (link), provider under it, "For Jordan" in household | left |
| Category | `xl` | Category label | left |
| Amount | `md` | `MoneyText md` with the frequency phrase | right |
| Next payment | `md` | Date, and a `DueChip` when soon | left |
| Renewal and notice | `xl` | Renewal date, and a notice chip when close | left |

**Filters.**

| Filter | Values | Default | API query |
|---|---|---|---|
| Status | Active, Cancelled, All | Active | `status` |
| Category | All categories, then the groups in 3.4 | All | `category` |
| Applies to (household only) | All, Whole household, each member | All | `member_user_id` |

- **Applies to filter values.** A filter has its own values: `all` (no filter), `household` (`member_user_id` is null) and a member id. These are separate from `AppliesToSelect`'s `""`, which means "whole household" on a form (3.7). HEM-021 wires the filter and maps these values to the API query. The same rule applies to the expense and income filters (5.1, 6.1).
- Phone: a "Filters" button (44 px) opens a sheet with the three controls and two buttons: "Show contracts" (primary) and "Clear filters" (text). The button label shows the count of active filters beyond the default ("Filters: Active, 1 more").
- Desktop: the controls sit in a row above the table with labels above them. Changing a filter updates the list at once (no submit button).

**States**

| State | What the user sees | Copy |
|---|---|---|
| Loading | Three skeleton cards on phone, three skeleton rows on `md` and up. Same heights as the final content. `aria-busy` on the list. Pulsing is off under reduced motion. | (sr) "Loading contracts" |
| Empty, no contracts | `EmptyState` `page`, icon `FileText` in a 56 px `--muted` circle (tinted with the space accent, see `app-shell.md` 6). One primary button, and the page header has no "Add a contract" button in this state, so the action is not shown twice (N5, the same rule as 5.1 and `app-shell.md` 6). | Title: "No contracts yet". Body: "Add insurance, subscriptions and bills in one place. We will remind you before each one renews." Primary: "Add a contract". Secondary link: "Learn how reminders work" (links to the notifications page, when it exists; hidden until then). |
| Empty, filter has no match | `EmptyState` `inline` inside the list area. No primary button, because the header already has "Add a contract". | Title: "No matching contracts". Body: "Change or clear the filters to see more." Action: "Clear filters" (text button, 44 px). |
| Error | `FormMessage` kind error above the list, with a Retry button (44 px). Filters stay usable. | "We could not load your contracts just now." Button: "Retry" |
| Populated | Cards or rows as above. | none |
| Loading more | Button "Show more contracts" shows "Loading…" and keeps its width. | "Loading…" |
| Success (after create, cancel or delete) | `FormMessage` kind success above the list, `role="status"`, for 5 seconds, plus a toast. | "Contract saved." / "Contract deleted." |

**Content.** Sentence case headings. "Add a contract" (not "Create contract"). Amounts always with the frequency phrase ("a year", "a month").

**Responsive.**
- 375: one column of cards, filter sheet, primary button full width.
- 768: `DataTable` with Contract, Amount and Next payment. Filter row above the table. Max width of the content area is the shell's.
- 1280: full table with all five columns. Filter row above.

**Focus order.** "Add a contract", "Filters", then each card or row in order (name link, then the rest of the row), then "Show more contracts".

---

### 4.2 Contract detail (`/contracts/[id]`)

**Purpose.** Show one contract, its schedule, and what it applies to. The user can edit it, mark it as cancelled, or delete it.

**Phone 375 px**

```
 PHONE 375 px
+--------------------------------------------------+
| [H]        [Lock Personal v]              (bell)  |
+==================================================+
| < Contracts                                      |  back link, 44 px
| Car insurance                                    |  h1
| [Lock Personal]                                  |  SpaceBadge md
| Harbor Insurance · Insurance, car                |  text-lead
|                                                  |
| [ Edit contract                              ]   |  primary, full width
| [ ... ]                                          |  44 px menu: Mark as cancelled, Delete
|                                                  |
| +----------------------------------------------+ |
| | Schedule                                      | |  h2 in HemCard
| | Next payment       3 Dec 2026                 | |
| | [Clock] Due in 6 days                         | |  DueChip soon
| | Renews             1 Jan 2027                 | |
| | Notice deadline    2 Dec 2026                 | |
| | [Clock] Notice deadline soon, in 5 days       | |  DueChip soon
| | Notice period: 30 days before renewal         | |  text-small
| +----------------------------------------------+ |
|                                                  |
| +----------------------------------------------+ |
| | Details                                       | |
| | Amount          EUR 4,350.00 a year           | |
| | Starts          1 Jan 2026                    | |
| | Ends            No end date                   | |
| | Renews          Automatically, every 12 months| |
| | Applies to      Whole household               | |
| | Notes           Policy ends at renewal ...    | |
| +----------------------------------------------+ |
|                                                  |
| Expenses for this contract                    >  |  link, 44 px
+--------------------------------------------------+
| Dashboard  Contracts  Reports  Alerts      More  |
+--------------------------------------------------+
```

**Desktop 1280 px.** Breadcrumb in the page header ("Contracts / Car insurance"). Two columns: Schedule on the left, Details on the right. "Edit contract" is the primary button on the title row. "..." menu holds "Mark as cancelled" and "Delete contract".

```
| Contracts / Car insurance                       [Lock Personal]     [ Edit contract ] [...] |
| Harbor Insurance · Insurance, car                                                             |
|                                                                                               |
| +------------------------------------------+  +-----------------------------------------------+|
| | Schedule                                 |  | Details                                       ||
| | Next payment     3 Dec 2026              |  | Amount        EUR 4,350.00 a year             ||
| | [Clock] Due in 6 days                    |  | Starts        1 Jan 2026                      ||
| | Renews           1 Jan 2027              |  | Ends          No end date                     ||
| | Notice deadline  2 Dec 2026              |  | Renews        Automatically, every 12 months  ||
| | [Clock] Notice deadline soon, in 5 days  |  | Applies to    Whole household                 ||
| | Notice period: 30 days before renewal    |  | Notes         Policy ends at renewal          ||
| +------------------------------------------+  +-----------------------------------------------+|
| Expenses for this contract  >                                                                 |
```

**Schedule card rules.**

| Field | Shown when | Copy if null |
|---|---|---|
| Next payment | always | Cancelled: "No payments due, cancelled". Ended: "Ended on {end_date}". |
| Renews | `renewal_date` present | "No renewal date" (not renewing automatically and no end date). |
| Notice deadline | `notice_deadline` present | "No notice period set" (only if `notice_period_days` is null). |
| Notice passed | notice deadline in the past | Neutral text: "Notice period passed on {date}. It renews on {renewal date}." No chip. |

The schedule's words follow 3.8. Dates use the full format ("3 Dec 2026").

**Details rules.** The "Renews" line: "Automatically, every 12 months" when `auto_renew` is true, "Does not renew automatically" when false. The `renewal_term_months` default is 12 when the field is empty and auto-renew is on (HEM-018).

**Components.** `PageHeader` (back link on phone, breadcrumb on desktop, `SpaceBadge`, primary action, secondary "..." menu), `HemCard` (x2), `DueChip`, `MoneyText` (`md`), `Button`, `DropdownMenu` (menu items 44 px tall), `ResponsiveDialog` (edit form, alerts), `EmptyState` (not used on this page, because a contract always exists here), `Skeleton`, `FormMessage`.

**States**

| State | What the user sees | Copy |
|---|---|---|
| Loading | Title skeleton, then two card skeletons of the final height. `aria-busy` on the main area. | (sr) "Loading contract" |
| Not found (404, or another space's id) | The shared not-found view (the same one for both cases, as in `households.md` 6.10). | "We could not find this contract." Button "Back to contracts". |
| Error | `FormMessage` kind error above the cards, with Retry. | "We could not load this contract just now." Button "Retry" |
| Cancelled | Badge "Cancelled" (text, `Badge` outline) under the title. The "Edit" button stays. "Make active again" replaces the "..." menu item "Mark as cancelled". | Badge: "Cancelled" |
| Made active again | Success `FormMessage` (kind success) at the top, and the badge goes. | "Contract is active again." |
| Mark as cancelled, success | Badge appears, and the schedule shows "No payments due, cancelled". | "Contract marked as cancelled." |
| Deleted | Navigates to `/contracts`, toast. | "Contract deleted." |
| Expenses link | Link to `/expenses?contract_id={id}`. | "Expenses for this contract" |

**Responsive.** 375: one column, cards full width, primary button full width. 768: two cards in one column each at the content width, max 640 px. 1280: two columns as shown.

**Focus order.** Back link, "Edit contract", "...", then the schedule card (not focusable), the details card, then the expenses link.

---

### 4.3 Create and edit a contract (dialog)

Opened by "Add a contract" (`/contracts?new=1`, so the empty state and the dashboard can link to it), or by "Edit contract" on the detail page. Title: "Add a contract" or "Edit contract". `SpaceBadge` under the title. A `ResponsiveDialog` (3.10). On phone, a bottom sheet with the body scrolling and the footer pinned.

```
 PHONE 375 px, bottom sheet
+--------------------------------------------------+
|                    ____                          |
| Add a contract                              (X)  |  title
| [Lock Personal]                                  |  SpaceBadge md
|--------------------------------------------------|
| About                                            |  legend, h3
|  Name                                            |
|  [ Car insurance                             ]   |
|  Provider (optional)                             |
|  [ Harbor Insurance                          ]   |
|  Category                                        |
|  [ Choose a category                       v ]    |
|                                                  |
| Cost                                             |
|  Amount                       Currency           |
|  [ 4350                  ]    [ EUR, euro  v ]   |
|  Billed                                          |
|  [ Yearly                                  v ]   |
|                                                  |
| Dates                                            |
|  Starts                                          |
|  [ 1 Jan 2026                               ]    |
|  Ends (optional)                                 |
|  [                                          ]    |
|  Leave empty if it runs until you cancel it.     |
|                                                  |
| Renewal                                          |
|  [x] Renews automatically                        |  CheckboxRow, 44 px
|      It carries on after the end date.           |
|  Renews every (months)                           |  shown only when checked
|  [ 12                                        ]   |
|  Notice period (days, optional)                  |
|  [ 30                                        ]   |
|  How many days before renewal you must give      |
|  notice. Leave empty if there is none.           |
|                                                  |
| Applies to (optional)                            |  household only
|  [ Whole household                         v ]   |
| Notes (optional)                                 |
|  [                                           ]   |
|--------------------------------------------------|
| [ Save contract                              ]   |  pinned, full width
| [ Cancel ]                                       |  text button, 44 px
+--------------------------------------------------+
```

**Dialog width (B4).** `ResponsiveDialog` sets `md:max-w-md` by default. This form passes `className="md:max-w-lg"`. `cn()` merges the classes, so `md:max-w-lg` replaces the default and is the only width class on the dialog. Every other form in this spec keeps the default `md:max-w-md` (448 px). `max-w-lg` gives 464 px of content width after the 24 px padding on each side, which is what the Starts and Ends row needs.

**Rows (B4).** `AmountInput` takes a full row. Only two pairs share a row, and only from `md` (below `md` every field is one row):
- Starts and Ends (the dates).
- Renews every (months) and Notice period (days), when both are shown.

At 464 px of content width, each half of a pair is 224 px. The Amount row is 308 px for the amount and 144 px for the currency.

**Desktop 1280 px.** Centred dialog, `max-w-lg` (512 px, as set above). The body scrolls past 70 vh. Footer right-aligned: "Cancel" (text) and "Save contract" (primary).

```
 768 px, centred dialog, max-w-lg (512 px). The rest of the screen is dimmed.
          +----------------------------------------------+
          | Add a contract                           (X) |
          | [Lock Personal]                              |
          |----------------------------------------------|
          | About                                        |
          |  Name                                        |
          |  [ Car insurance                        ]    |
          |  Provider (optional)                         |
          |  [ Harbor Insurance                     ]    |
          |  Category                                    |
          |  [ Choose a category                  v ]    |
          | Cost                                         |
          |  Amount                      Currency        |
          |  [ 4350                ]     [ EUR   v ]     |  full row: AmountInput
          |  Billed                                      |
          |  [ Yearly                             v ]    |
          | Dates                                        |
          |  Starts                      Ends (optional) |  share a row (224 px each)
          |  [ 1 Jan 2026       ]        [          ]    |
          |  Leave empty if it runs until you cancel it. |
          | Renewal                                      |
          |  [x] Renews automatically                    |
          |  Renews every (months)   Notice period (days,|
          |  [ 12            ]       [ 30          ]     |  optional label wraps
          |  How many days before renewal you must give  |
          |  notice. Leave empty if there is none.       |
          | Applies to (optional)                        |
          |  [ Whole household                    v ]    |
          | Notes (optional)                             |
          |  [                                      ]    |
          |----------------------------------------------|
          |                    [ Cancel ] [ Save contract ] |  md: footer right-aligned
          +----------------------------------------------+
```

**Fields and API names.**

| Field (UI label) | `name` | Type | Required | Notes |
|---|---|---|---|---|
| Name | `name` | text, max 80 | yes | Error: "Enter a name for the contract." |
| Provider (optional) | `provider` | text, max 80 | no | |
| Category | `category_id` | `CategorySelect` | yes | Error: "Choose a category." |
| Amount and currency | `amount`, `currency` | `AmountInput`, full row | yes | 3.1.1. The currency error slot shows a server error on `currency`. |
| Billed | `frequency` | `FrequencySelect` (no irregular) | yes | Default monthly |
| Starts | `start_date` | date | yes | Default today |
| Ends (optional) | `end_date` | date | no | On or after `start_date` |
| Renews automatically | `auto_renew` | `CheckboxRow` | no | Default off. Unchecked hides the renewal term. |
| Renews every (months) | `renewal_term_months` | number, `inputMode="numeric"` | when auto-renew | Default 12. Whole number 1 to 120. |
| Notice period (days, optional) | `notice_period_days` | number, `inputMode="numeric"` | no | Whole number 0 or more. |
| Applies to (optional) | `member_user_id` | `AppliesToSelect` | no | Household only. |
| Notes (optional) | `notes` | textarea, max 500 | no | The `Textarea` primitive is owned by HEM-021 (N10, 12.2). |

Status is not a field in the form. Status changes use the detail page actions (F12).

**Validation messages.**

| Rule | Message |
|---|---|
| Name empty | "Enter a name for the contract." |
| Category not chosen | "Choose a category." |
| Amount | 3.1.1 |
| Start date empty | "Enter the start date." |
| End before start | "The end date must be on or after the start date." |
| Renewal term not a whole number from 1 to 120 | "Enter a whole number of months, from 1 to 120." |
| Notice period not a whole number of 0 or more | "Enter a whole number of days, for example 30." |
| Member not in the space (422, `member_user_id`) | Server message under "Applies to". |
| Category not in the space (422, `category_id`) | Server message under "Category". |
| Currency rejected (422, `currency`) | Server message under the amount row, in the currency error slot of `AmountInput` (B2, 3.1). |

**Copy.** Hints: "Leave empty if it runs until you cancel it." (end date); "How many days before renewal you must give notice." (notice). Success toast: "Contract saved."

**States**

| State | What the user sees |
|---|---|
| Opening (edit) | Fields show skeleton shapes for one frame, then the saved values. `aria-busy` on the form. |
| Idle | Fields as above. Save disabled only while the form is being submitted. |
| Busy | "Saving…" on the save button, same width. Cancel and close disabled. |
| Validation error | Field errors under each field. Focus moves to the first invalid field. |
| Server error | `FormMessage` kind error at the top of the body, with the server detail or the generic network message. Values kept. |
| Success | Dialog closes, list or detail updates, toast "Contract saved." |

**Responsive.** 375: bottom sheet, footer pinned, every field one row. 768 and up: centred dialog, `max-w-lg` (set by the form, above). The Cost row is always full width. Starts and Ends share a row from `md`, and so do Renews every and Notice period from `md`. The 768 wireframe is in 4.3.

---

### 4.4 Mark as cancelled, make active again, delete

- **Mark as cancelled** is in the "..." menu on the detail page. It opens the alert in 3.11. Success changes the badge and the schedule (4.2).
- **Make active again** is a menu item when the contract is cancelled. It runs at once (no confirmation: it is not destructive). The button shows "Making active…" while busy.
- **Delete contract** is in the "..." menu, last, after a separator, in the destructive colour. It opens the alert in 3.11. On success the page navigates to `/contracts` with a toast.

---

## 5. Expenses

An expense is a one-off payment: groceries, a repair, a school trip. It can be linked to a contract, for example a monthly electricity bill recorded as an expense.

### 5.1 Expense list (`/expenses`)

**Purpose.** See what was spent, newest first, grouped by month, with a quick way to add one.

**Phone 375 px**

```
 PHONE 375 px
+--------------------------------------------------+
| [H]        [Lock Personal v]              (bell)  |
+==================================================+
| Expenses                                         |  h1
| [Lock Personal]                                  |  SpaceBadge md
| Record one-off payments to see where the         |  text-lead
| money goes.                                      |
|                                                  |
| [ + Add an expense                           ]   |  primary, full width
| [ Filters                                    ]   |  outline, opens filter sheet
|                                                  |
| November 2026                       5 expenses   |  MonthHeader (h2)
| ------------------------------------------------ |
| +----------------------------------------------+ |
| | Groceries                                 > | |  whole row is a button (edit)
| | Food · Corner Market                         | |
| | 12 Nov 2026                  EUR 64.20       | |  amount right, MoneyText md
| +----------------------------------------------+ |
| +----------------------------------------------+ |
| | Train tickets                             > | |
| | Transport · For Jordan                       | |
| | 9 Nov 2026                   SEK 540.00      | |  currency code: not the base
| |                              About EUR 48.11 | |  ConvertedAmount
| +----------------------------------------------+ |
|                                                  |
| October 2026                       12 expenses   |
| ...                                              |
| [ Show more expenses                         ]   |
+--------------------------------------------------+
| Dashboard  Contracts  Reports  Alerts      More  |
+--------------------------------------------------+
```

Expenses sits under More on phone (`app-shell.md` 3.1). A "Expenses" link on the dashboard and the contract detail page leads here.

**Desktop 1280 px.** Table with columns Date, Description, Category, Applies to, Amount. A month header row spans the table, or the month title sits above a sub-table; the implementation chooses, but the month header is an `h2` in both cases. The table uses `DataTable` with a rowFooter for none.

```
| Expenses [Lock Personal]                                       [ + Add an expense ]     |
| Filters: From [ 1 Nov 2026 ]  To [ 30 Nov 2026 ]  Category [All categories v]           |
|                                                                                         |
| November 2026                                                             5 expenses    |
| +----------+------------------------+-----------------+--------------+-----------------+ |
| | Date     | Description            | Category        | Applies to   | Amount          | |
| +----------+------------------------+-----------------+--------------+-----------------+ |
| | 12 Nov   | Groceries              | Food            | Household    | EUR 64.20       | |
| |          | Corner Market          |                 |              |                 | |
| | 9 Nov    | Train tickets          | Transport       | Jordan       | SEK 540.00      | |
| |          |                        |                 |              | About EUR 48.11 | |
| +----------+------------------------+-----------------+--------------+-----------------+ |
```

**Row content (card and table).**

| Part | Source | Note |
|---|---|---|
| Title | `description`, or the category label when empty | `text-body-strong`, clamped to two lines |
| Meta | category label, `merchant`, "For {member}" (household), "Linked to {contract name}" when `contract_id` is set | `text-small`, muted, joined with " · " |
| Date | `spent_on` | "12 Nov 2026" |
| Amount | `amount` and `currency` (flat record fields, section 11) | `MoneyText md`, right-aligned, `shrink-0 whitespace-nowrap` (3.2); `showCode` when not the base currency |
| Converted | `base_amount` (Money or null) | `ConvertedAmount`, under the amount. Hidden when null. |

The whole card (or row, on the title) is one button that opens the edit dialog. Its accessible name: "Groceries, EUR 64.20, 12 Nov 2026".

**Month headers (F10).** `MonthHeader` with the title "November 2026" (`Intl.DateTimeFormat` with `month: "long"`, `year: "numeric"`) and a summary "5 expenses" (or "1 expense"). A month that continues on the next page does not repeat its header. A total appears only if the API returns one. This phase's API does not return one (F10).

**Filters.**

| Filter | Control | Default | API query |
|---|---|---|---|
| From | date | empty | `from` (inclusive) |
| To | date | empty | `to` (inclusive) |
| Category | `CategorySelect` with "All categories" | All | `category` |
| Applies to (household) | `AppliesToSelect` with "All members" | All | `member_user_id` |
| Linked to a contract | not a control. Set by the "Expenses for this contract" link (`contract_id`). Shows as a removable chip "Car insurance ×" (44 px). | none | `contract_id` |

From and To are inclusive, as the API promises (HEM-019). The "×" chip removes the filter.

**States**

| State | What the user sees | Copy |
|---|---|---|
| Loading | Three skeleton cards (phone) or three skeleton rows (`md`+), with a month header skeleton. `aria-busy`. | (sr) "Loading expenses" |
| Empty, no expenses | `EmptyState` `page`, icon `Receipt`, primary "Add an expense" (the header button is hidden in this state so the action is not repeated, as `app-shell.md` 6). | Title: "No expenses this month". Body: "Record one-off payments to see where the money goes." |
| Empty, filter has no match | `EmptyState` `inline`, no button. | Title: "No matching expenses". Body: "Change or clear the filters to see more." Action: "Clear filters". |
| Error | `FormMessage` kind error above the list with Retry. | "We could not load your expenses just now." Button "Retry". |
| Populated | Month groups as above. | none |
| Loading more | "Show more expenses" shows "Loading…". | "Loading…" |
| Success (added, edited, deleted) | Toast. The list updates in place. | "Expense added.", "Expense saved.", "Expense deleted." |

**Responsive.** 375: cards, filter sheet, primary button full width. 768: `DataTable` with Date, Description, Amount (Category and Applies to hidden below `xl`). 1280: all columns.

**Focus order.** "Add an expense", "Filters", linked-contract chip if shown, then each row or card in order, then "Show more expenses".

---

### 5.2 Quick add (dialog, phone-first)

Opened by "Add an expense" (or `/expenses?new=1`). Title "Add an expense". The focus starts in the amount field, and the phone shows the decimal keypad.

```
 PHONE 375 px, bottom sheet
+--------------------------------------------------+
|                    ____                          |
| Add an expense                              (X)  |
| [Lock Personal]                                  |
|--------------------------------------------------|
|  Amount                       Currency           |
|  [ 12.50                  ]   [ EUR, euro  v ]   |  autofocus, decimal keypad
|  Use . before the cents.                         |
|  Category                                        |
|  [ Food                                    v ]   |  last used in this space (F19)
|  Date                                            |
|  [ 27 Nov 2026                              ]    |  defaults to today
|                                                  |
|  > More details                                  |  disclosure, collapsed, 44 px
|                                                  |
|--------------------------------------------------|
| [ Save expense                               ]   |  pinned, full width
| [ Save and add another                       ]   |  outline, full width
+--------------------------------------------------+
```

**Expanded "More details"** shows: Description (optional, max 120), Merchant (optional, max 80), Applies to (optional, household only), and Linked contract (optional, a select of the space's active contracts). Under the contract select, the hint reads: "If the contract is deleted, this expense stays and loses the link."

**Rules.**
- "Save and add another" saves, keeps the dialog open, clears the amount and keeps the category, date and currency. The amount field is focused again. A toast says "Expense added. Add another."
- "Save expense" saves and closes. Toast "Expense added."
- The category has a default only from F19. If none, it shows "Choose a category" (disabled) and the save button still works after a choice.
- The date defaults to today in the user's time zone. The date can be changed. It may be at most one day in the future (Q10), and the API rejects a later date.

**Validation.** Amount (3.1.1), category "Choose a category.", date "Enter the date you paid.", and the future-date message in 3.6.

**States.** Idle, busy ("Saving…" on both buttons, one busy at a time), validation errors, server errors (`FormMessage` at the top, values kept), success (toast, close or reset).

**Desktop 1280 px.** The same dialog, centred, `max-w-md` (448 px, the default). The fields stack. The amount and currency row is `AmountInput` at full width of the dialog body (B4). The "More details" disclosure works the same way.

---

### 5.3 Edit an expense (dialog)

Opened by tapping an expense row. Title "Edit expense". The same fields as quick add, with "More details" open by default. The footer holds "Save changes" (primary), and, below a divider, "Delete expense" (text button, destructive). Deleting follows 3.11.

Empty and error states are as in 3.10. Unsaved changes ask before closing (F18).

---

## 6. Income

Income has two lists. **Entries** are payments received (a salary payment, a client invoice paid). **Sources** are the things that pay (a salary from one employer, a business). An entry can belong to a source, or to none.

### 6.1 Income entries (`/income`)

**Purpose.** See what was received, newest first, grouped by month, and add a received payment.

**Section links** (like `households.md` 3.1): "Entries" (current, `aria-current="page"`) and "Sources" (`/income/sources`). 44 px, in a row.

**Phone 375 px**

```
 PHONE 375 px
+--------------------------------------------------+
| [H]        [Lock Personal v]              (bell)  |
+==================================================+
| Income                                           |  h1
| [Lock Personal]                                  |
| Money you receive, and where it comes from.      |
|                                                  |
| [ + Add income                               ]   |  primary, full width
|                                                  |
| [ Entries ]  [ Sources ]                         |  section links, Entries current
|--------------------------------------------------|
| November 2026                        2 payments  |
| +----------------------------------------------+ |
| | Salary, Northwind Ltd                     > | |  whole row is a button (edit)
| | Income · Salary                              | |
| | 28 Nov 2026                  +EUR 2,850.00   | |  + sign and word "Income"
| +----------------------------------------------+ |
| +----------------------------------------------+ |
| | Design work, invoice 14                   > | |
| | Income · Business                            | |
| | 16 Nov 2026                  +USD 600.00     | |
| |                              About EUR 552.10| |  ConvertedAmount, no sign
| +----------------------------------------------+ |
|                                                  |
| [ Show more income                           ]   |
+--------------------------------------------------+
| Dashboard  Contracts  Reports  Alerts      More  |
+--------------------------------------------------+
```

The ConvertedAmount line on income reads "About EUR 552.10" (no extra plus sign; the sign shows on the original amount only).

**Desktop 1280 px.** Table: Date, Description, Source, Applies to, Amount (right). Section links under the title. Month header rows as in 5.1.

**Entry row content.**

| Part | Source | Note |
|---|---|---|
| Title | `description`, or the source name when empty | clamp two lines |
| Meta | "Income", the source's type label (Salary, Business, Other), or "No source", and "For {member}" (household) | `text-small` |
| Date | `received_on` | |
| Amount | `amount` and `currency` (flat record fields, section 11) | `+` sign (`signDisplay="always"`), right-aligned, `shrink-0 whitespace-nowrap`, `MoneyText md` |
| Converted | `base_amount` (Money or null) | `ConvertedAmount`, "About {base}". Hidden when null. |

**Filters.** From, To (inclusive), Source (`source_id`, "All sources" or each source), Applies to (household). Filter sheet on phone, row on desktop.

**States**

| State | What the user sees | Copy |
|---|---|---|
| Loading | Skeleton rows or cards. `aria-busy`. | (sr) "Loading income" |
| Empty, no entries | `EmptyState` `page`, icon `Banknote`, primary "Add income", secondary text link "Set up a regular source" (goes to `/income/sources`). | Title: "No income recorded". Body: "Record a payment when it arrives, or add a regular source such as a salary." |
| Empty, filter has no match | `EmptyState` `inline`, action "Clear filters". | "No matching income" / "Change or clear the filters to see more." |
| Error | `FormMessage` error, Retry. | "We could not load your income just now." |
| Populated | Groups as above. | none |
| Success | Toast. | "Income added.", "Income saved.", "Income deleted." |

**Responsive and focus order** follow 5.1.

---

### 6.2 Add or edit income (dialog)

Title "Add income" or "Edit income". Fields in this order:

| Field (UI label) | `name` | Type | Required | Notes |
|---|---|---|---|---|
| Amount and currency | `amount`, `currency` | `AmountInput` | yes | 3.1.1 |
| Received on | `received_on` | date | yes | Default today. Error "Enter the date you received it." A date more than one day ahead: "The date cannot be more than a day in the future." (Q10) |
| From source (optional) | `source_id` | select: "No source" and the space's sources | no | Sources with `active` false are listed under "Paused" in the option text, for example "Salary (paused)". |
| Description (optional) | `description` | text, max 120 | no | |
| Applies to (optional) | `member_user_id` | `AppliesToSelect` | no | Household only. |

Footer: "Save income" (primary) and, when editing, a divider and "Delete income" (destructive, 3.11). Success toast "Income added." / "Income saved.".

Desktop: centred dialog, `max-w-md` (the default). The amount row is full width (3.1).

---

### 6.3 Income sources (`/income/sources`)

**Purpose.** Set up the things that pay regularly, so the user can see them and link entries to them.

**Phone 375 px**

```
 PHONE 375 px
+--------------------------------------------------+
| ...top bar...                                    |
+==================================================+
| Income                                           |
| [Lock Personal]                                  |
| [ + Add a source                             ]   |
| [ Entries ]  [ Sources ]                         |  Sources current
|--------------------------------------------------|
| +----------------------------------------------+ |
| | Salary, Northwind Ltd                     > | |  whole card is a button (edit)
| | Salary · Monthly                             | |
| | EUR 2,850.00 a month                         | |
| | [Check] Active                               | |  Badge with icon
| +----------------------------------------------+ |
| +----------------------------------------------+ |
| | Freelance design                          > | |
| | Business · Irregular                         | |
| | EUR 600.00, typical amount                   | |  irregular: "typical amount"
| | [Pause] Paused                               | |  Badge outline with icon
| +----------------------------------------------+ |
+--------------------------------------------------+
```

An income source always has an amount (HEM-019: `amount` is required, not nullable). For an irregular source the amount is the typical amount: the field is labelled "Typical amount", and the row reads "EUR 600.00, typical amount".

**Source row content.** Name (clamp), type label and frequency phrase in meta ("Salary · Monthly"), amount with phrase ("EUR 2,850.00 a month", or "EUR 600.00, typical amount" for irregular), active state badge with icon: "Active" (`Check` icon, `--success` text on `--success-subtle`) or "Paused" (`Pause` icon, `--muted-foreground` on outline). "For {member}" in household.

**Source form (dialog)** "Add a source" / "Edit source":

| Field (UI label) | `name` | Type | Required | Notes |
|---|---|---|---|---|
| Name | `name` | text, max 80 | yes | Error "Enter a name for the source." |
| Type | `type` | native select: Salary, Business, Other | yes | Default Salary. |
| Typical amount (or "Amount" when regular) and currency | `amount`, `currency` | `AmountInput` | yes | 3.1.1. Label says "Typical amount" when irregular. |
| How often | `frequency` | `FrequencySelect` with irregular | yes | Default monthly. |
| Applies to (optional) | `member_user_id` | `AppliesToSelect` | no | Household only. |
| Active | `active` | `CheckboxRow` | no | Default checked. Description: "Turn off to pause this source. Its payments stay in your list." |

Footer: "Save source" (primary), and when editing, divider and "Delete source" (destructive, 3.11).

Validation messages: name ("Enter a name for the source."), type ("Choose a type."), amount (3.1.1).

**States**

| State | What the user sees | Copy |
|---|---|---|
| Loading | Card skeletons. | (sr) "Loading income sources" |
| Empty | `EmptyState` `page`, icon `Banknote`, primary "Add a source", secondary text link "Record a one-off payment instead" (goes to `/income?new=1`). | Title: "No income sources yet". Body: "Add a salary or a business so you can link the payments you receive." |
| Error | `FormMessage` kind error, Retry. | "We could not load your income sources just now." |
| Paused | Badge "Paused", and the card stays in the list. | "Paused" |
| Success | Toast. | "Source saved.", "Source deleted." |

**Responsive (B5).** 375: stacked cards.

- **768 (`md` to `xl`).** A `DataTable` with three columns: Name, Amount (right) and Status. The content width is 648 px (`app-shell.md` 2.2 and 3.3), and five columns do not fit it. Type and How often are not columns here. They move into the Name cell as meta text under the name ("Salary · Monthly"). In `DataTable` terms, the Type and How often columns use `from="xl"`, and the Name cell renders the same type and frequency text with `xl:hidden`. Nothing is lost at 768: each source's type and frequency is still on the row.
- **1280 (`xl` and up).** A `DataTable` with all five columns: Name, Type, How often, Amount (right) and Status. The meta line under the name is hidden here (`xl:hidden`), so the words appear once.

```
 768 px, content 648 px. Income sources (Sources is the current section link)
+--------------------------------------------------------------------------+
| Income                                                   [ + Add a source ] |
| [Lock Personal]                                                          |
| [ Entries ]  [ Sources ]                                                 |
|                                                                          |
| +----------------------------------------------------------------------+ |
| | Name                                    | Amount          | Status   | |
| |-----------------------------------------+-----------------+----------| |
| | Salary, Northwind Ltd          >        | EUR 2,850.00    | [Check]  | |
| | Salary · Monthly                        | a month         | Active   | |
| |-----------------------------------------+-----------------+----------| |
| | Freelance design               >        | EUR 600.00      | [Pause]  | |
| | Business · Irregular                    | typical amount  | Paused   | |
| +----------------------------------------------------------------------+ |
+--------------------------------------------------------------------------+
```

Column widths at 768 (648 px): Name takes the rest (about 300 px), Amount about 170 px (right-aligned), Status about 140 px. Each row is at least 56 px tall, and the whole row is one button for editing (the name is the accessible name, as in the cards).

The 768 wireframe shows the Name with its type and frequency. The 1280 table shows Type and How often as their own columns, with the same rows.

**Focus order.** Section links, "Add a source", then each source card or row.

---

## 7. Dashboard (`/dashboard`)

**Purpose.** A calm summary of the active space for this month and the next 30 days, in the user's base currency.

### 7.1 Populated

**Phone 375 px**

```
 PHONE 375 px
+--------------------------------------------------+
| [H]        [Lock Personal v]              (bell)  |
+==================================================+
| Dashboard                                        |  h1
| [Lock Personal]                                  |
|                                                  |
| [ + Add an expense                           ]   |  page header action, full width
|                                                  |
| +----------------------------------------------+ |
| | Spent this month                             | |  StatCard (section, h2)
| | €812.40                                      | |  MoneyText lg
| | November 2026                                | |  hint: month
| +----------------------------------------------+ |
| +----------------------------------------------+ |
| | Recurring cost                               | |
| | €1,043.00 a month                            | |  monthly equivalent of contracts
| | Contracts, as a monthly amount               | |
| +----------------------------------------------+ |
| +----------------------------------------------+ |
| | Income this month                            | |
| | +€2,850.00                                   | |
| | Income for November 2026                     | |
| +----------------------------------------------+ |
| (i) 1 amount is not in EUR, because no rate     |  hint, text-small, muted, icon
|     was found for its date. Totals leave it out.|
|                                                  |
| Next 30 days                                     |  section h2
| +----------------------------------------------+ |
| | [CreditCard] Payment          3 Dec 2026     | |  event type with icon and text, date right
| | Car insurance, Harbor Insurance              | |
| | €362.50                                      | |  amount on its own line
| | [Clock] Due in 6 days                        | |  DueChip on its own line
| +----------------------------------------------+ |
| +----------------------------------------------+ |
| | [RefreshCw] Renewal          14 Dec 2026     | |
| | Music streaming, Lark Audio                  | |
| | €11.99                                       | |
| | [Clock] Renews in 6 days                     | |
| +----------------------------------------------+ |
| +----------------------------------------------+ |
| | [CalendarClock] Notice deadline  2 Dec 2026  | |  no amount line: a notice date is not a payment
| | Car insurance                                | |
| | [Clock] Notice deadline soon, in 5 days      | |
| +----------------------------------------------+ |
|                                                  |
| Contracts and expenses in one place. See all >   |  link, 44 px
+--------------------------------------------------+
| Dashboard  Contracts  Reports  Alerts      More  |
+--------------------------------------------------+
```

The "Notice deadline" event has no amount (a notice date is not a payment). It shows no amount.

**Desktop 1280 px.** Three totals across the top, then the upcoming list full width (960 px of content).

```
| Dashboard  [Lock Personal]                                       [ + Add an expense ] |
|                                                                                       |
| +------------------------+ +------------------------+ +------------------------+     |
| | Spent this month       | | Recurring cost         | | Income this month      |     |
| | €812.40                | | €1,043.00 a month      | | +€2,850.00             |     |
| | November 2026          | | Contracts, monthly     | | Received November 2026 |     |
| +------------------------+ +------------------------+ +------------------------+     |
|  (i) 1 amount is not in EUR. No rate for its date. Totals leave it out.               |
|                                                                                       |
| Next 30 days                                                                          |
| Type          Contract                         Date          Amount        When       |
| -------------------------------------------------------------------------------------- |
| [CreditCard]  Car insurance, Harbor Insurance  3 Dec 2026    EUR 362.50    [Clock] Due in 6 days |
|   Payment                                                                             |
| [RefreshCw]   Music streaming, Lark Audio      14 Dec 2026   EUR 11.99     [Clock] Renews in 6 days |
|   Renewal                                                                             |
| [CalendarClock] Car insurance                  2 Dec 2026    (no amount)   [Clock] Notice deadline soon |
|   Notice deadline                                                                     |
```

**Upcoming row layout (N11).** Each event is a row on `xl` and up, and a stacked card everywhere below `xl`. Below `xl` the card is used at every width, because at 768 the Upcoming card sits in a half-width column (about 316 px).

- **Stacked (below `xl`).** Four lines, in this order: type with icon and date (the date is `shrink-0` on the right), name and provider (clamped), amount (on its own line, omitted for a notice deadline), DueChip (on its own line, so a long amount never shares a line with the chip).
- **Row (`xl`).** A fixed-column grid: type with icon (14 rem), name and provider (flexible, `min-w-0`, clamped), date (8 rem), amount (8 rem, right-aligned, `shrink-0 whitespace-nowrap`), DueChip (the rest, right-aligned, wraps under the amount only if the column is too narrow).

**Layout by width.**

| Width | Totals | Upcoming |
|---|---|---|
| 375 | One column, three cards stacked | One column, one card per event |
| 768 | Two columns: "Spent" and "Recurring cost" on row 1, "Income" on row 2 at the left | Row 2 right, beside "Income" |
| 1280 | Three columns on one row | Full width below, as a list |

At 768, row 2 has Income on the left and the Upcoming card on the right. The Upcoming card can hold up to 10 events and is tall on a 768 screen. That is acceptable, and its rows use the stacked layout (see the upcoming row layout above).

**Components.** `PageHeader` (`SpaceBadge`, primary action "Add an expense"), `StatCard` (x3), `MoneyText` (`lg`, currency from the Money object), `DueChip`, `HemCard`, `EmptyState` (`page` for first run, `inline` for the upcoming list), `FormMessage` (info, for the unconverted hint, icon `CircleHelp`), `Skeleton`, `Button`, `Badge` (for "Paused" elsewhere).

**Totals rules.**
- Each total is a `StatCard`. The figure is `MoneyText size="lg"`, in the currency of its Money object. The hint line names the month from `month` (for example "November 2026").
- "Recurring cost" uses the phrase "a month" next to the figure, and the hint says "Contracts, as a monthly amount". The API computes the monthly figure (HEM-023).
- The unconverted hint appears when `unconverted_count` is above 0. Copy for 1: "1 amount is not in {base}, because no rate was found for its date. Totals leave it out." For more than 1: "{n} amounts are not in {base}, because no rate was found for their dates. Totals leave them out." It uses `Intl.PluralRules` (or the two strings above).
- A zero total is a value: "€0.00", with the hint "No expenses this month yet. Record one to see it here." (the zero copy is per card: expenses, income).

**Upcoming list rules.**
- The API returns events in date order, at most 10 (HEM-023). The list shows them in that order.
- Each event: a type label with its icon (Payment `CreditCard`, Renewal `RefreshCw`, Notice deadline `CalendarClock`), the name, the provider or contract (text-small), the date, the amount if there is one (not for notice deadlines), and the `DueChip` (3.8).
- The whole event is not a link. The contract name is a link to `/contracts/[id]` (44 px).
- Events are shown with the words first, so the type and the due state never depend on colour.

**States**

| State | What the user sees | Copy |
|---|---|---|
| Loading | Three total skeletons of the final height, then an upcoming skeleton with three rows. `aria-busy`. Pulsing is off under reduced motion. | (sr) "Loading your summary" |
| First run (see 7.2) | One page empty state, no totals. | 7.2 |
| Partial (no expenses or no income) | The relevant card shows "€0.00" with its zero hint. Others show their figures. | see the zero hints |
| Upcoming empty | Inline empty state in the upcoming card, with a text link. No button (the header has the expense action). | Title: "Nothing due in 30 days". Body: "Payments, renewals and notice deadlines show here as they come up." Link: "Add a contract". |
| Unconverted hint | Info note under the totals (7.1). | 3.3 and the copy above |
| Error | `FormMessage` kind error above the totals, with Retry. The totals and the list are replaced by the error, because they come from one request. | "We could not load your summary just now." Button "Retry" |
| Space switched | Skeletons until the new space's data arrives. The previous space's numbers are never shown (`app-shell.md` 4.2). | none |

### 7.2 First run (no contracts, expenses or income)

```
 PHONE 375 px
+--------------------------------------------------+
| Dashboard                                        |
| [Lock Personal]                                  |
|                                                  |
|                       ( icon )                   |  Wallet, 56 px --personal-subtle circle
|                                                  |
|                 Start with your bills            |  h3 (3 words)
|                                                  |
|  Add a contract or record an expense. Totals     |
|  and upcoming payments appear here once you      |
|  have a few records.                             |
|                                                  |
|  [ Add a contract                            ]   |  primary, full width
|                                                  |
|            Record an expense instead             |  text link, 44 px
|                                                  |
+--------------------------------------------------+
```

- The page header has no action in this state (F17).
- The icon circle takes the active space's accent tint, as `EmptyState` does with `space`.
- Desktop: the same content centred in the content area, with the two actions side by side (primary button, text link).
- Copy: title "Start with your bills" (three words, within the four-word limit); body above. No apology, no exclamation mark.
- Privacy line for household spaces: "Household members see only what the household shares." is added under the body in a household space (`app-shell.md` 6, privacy rule).

### 7.3 Responsive summary (dashboard)

- No horizontal scroll at 375, 768 or 1280. The totals grid and the upcoming card wrap. Long names clamp to two lines.
- The three totals never shrink the figure below `text-money-lg` (28 px phone). A total or event amount never wraps (`whitespace-nowrap`, 3.2).
- Tap targets: the header button, the event contract link, "See all" link and the Retry button are all 44 px.

---

## 8. Content and microcopy

| Where | Copy |
|---|---|
| Headings | Sentence case: "Add a contract", "Next 30 days", "Recurring cost". |
| Primary buttons | Verb plus object: "Save contract", "Save expense", "Save and add another", "Save income", "Save source", "Add an expense", "Add income", "Add a contract", "Add a source". |
| Destructive buttons | The action's name: "Delete contract", "Delete expense", "Delete income", "Delete source", "Mark as cancelled", "Discard changes". Never "OK". |
| Dismiss buttons | "Keep contract", "Keep expense", "Keep income", "Keep source", "Keep editing" (in alerts). "Cancel" for plain dialogs. |
| Busy labels | "Saving…", "Adding…", "Deleting…", "Making active…", "Loading…" (same width). |
| Success toasts | "Contract saved.", "Contract deleted.", "Expense added.", "Expense saved.", "Expense deleted.", "Income added.", "Income saved.", "Income deleted.", "Source saved.", "Source deleted.". Short, no exclamation mark. |
| Validation | Specific sentences from 3.1.1, 3.6, 4.3, 5.2, 6.2, 6.3. Never "Invalid input". |
| Hints | "Use , before the cents." (locale-specific). "Leave empty if it runs until you cancel it." "Leave empty if there is none." "Turn off to pause this source. Its payments stay in your list." |
| Meta words | "Income" for income rows. "Expense" only in labels that need a word. "For {name}" for a member. "Linked to {contract}". |
| Privacy | "Only you see your personal records. Household members see only what the household shares." (shown once in the first-run state of a household, and in the contract form hint for "Applies to": "Household members see this record.") |
| Dates | "3 Dec 2026" (`Intl.DateTimeFormat`, `day`, `month: short`, `year`). Month headers "November 2026". |
| Amount phrases | "a month", "a year", "every 3 months", "every 6 months", "a week". |
| Zero hints | "No expenses this month yet. Record one to see it here." "No income this month yet. Add a source or record a payment." |

Tone rules: plain words, short sentences, "you" for the user, the household name for shared data, no finance jargon (no "amortisation", "accrual", "billing cycle anchor").

---

## 9. Accessibility

- **Tap targets.** Every button, link, filter, row or card, menu item and checkbox row is at least 44 × 44 px. Cards are one link or one button of at least 56 px height.
- **Contrast.** Text uses `--foreground` or `--muted-foreground` on `--card` or `--background` (both pass 4.5:1, `design-system.md` 2.3). Warning chips use `--warning` on `--warning-subtle` (4.8:1 light, 7.2:1 dark). Destructive text uses `--destructive` on `--background` (6.5:1 light, 6.3:1 dark, `design-system.md` 2.3). Input borders use `--input` (3.7:1).
- **Focus.** The global 2 px `--ring` outline with a 2 px offset, on `:focus-visible` only, in both themes (`design-system.md` 4.5). Dialogs trap focus and return it to the trigger.
- **Labels.** Every input and select has a visible label. Hints and errors are linked with `aria-describedby`. Invalid fields have `aria-invalid="true"`. Required fields have `aria-required="true"` (3.10).
- **Money.** A screen reader hears the amount with its currency code or symbol. "About" is read for a converted amount. Income rows carry the word "Income" in their meta text, so the direction is not read from the `+` sign alone.
- **Status by text and icon.** Due chips, paused and active badges, and cancelled badges all carry text and an icon. Colour is never the only signal.
- **Headings.** One `h1` per page. Month groups and card sections are `h2`. Card titles inside a section are `h3`.
- **Live regions.** Success messages are `role="status"`. Errors use `FormMessage` (`role="alert"`). Field errors are polite. The count of results for filters is announced once, after the list settles.
- **Reduced motion.** Dialogs and sheets fade only. Skeletons do not pulse. Transitions drop to 0 ms.
- **Focus after actions.** After a delete, focus moves to the list heading (not to the removed row). After closing a dialog, focus returns to the element that opened it.
- **Accessible names.** Row buttons include the name, amount and date. Icon-only controls have an `aria-label`. Links that look like buttons name their action ("Edit contract").

Focus order summary:
1. Contracts list: Add, Filters, each card or row, Show more.
2. Contract detail: Back, Edit, menu, schedule (not focusable), details, expenses link.
3. Expenses and income lists: Add, Filters, linked-contract chip (if any), rows, Show more.
4. Dialogs: the first field (amount for expenses and income, name for contracts), then fields in order, then the primary button, then Cancel.
5. Dashboard: Add an expense, then the upcoming list links in order.

---

## 10. Responsive behaviour

| Screen | 375 px | 768 px | 1280 px |
|---|---|---|---|
| Shell | Bottom nav, 16 px gutter | Icon rail (72 px), 24 px gutter | Sidebar (256 px), 32 px gutter |
| Contracts list | Cards, filter sheet, full-width button | `DataTable`: Contract, Amount, Next payment. Filter row | `DataTable`: all five columns. Filter row |
| Contract detail | One column | One column, max 640 px | Two columns (schedule, details) |
| Contract form | Bottom sheet, footer pinned, every field one row | Centred dialog, `max-w-lg` (set by the form). Starts and Ends share a row. Renews every and Notice period share a row. Cost is full width | Same as 768 |
| Expenses and income lists | Cards, month headers, filter sheet | `DataTable` without Category and Applies to | `DataTable` with all columns |
| Quick add and forms | Bottom sheet | Centred dialog, `max-w-md` | Same as 768 |
| Income sources | Cards | `DataTable`: Name (type and frequency under it), Amount, Status | `DataTable`: Name, Type, How often, Amount, Status |
| Dashboard | One column, totals stacked | Totals 2 + 1, Upcoming beside the third (stacked rows inside the card) | Totals in 3 columns, Upcoming full width (one row per event) |
| First run | One column, primary button full width | Centred, buttons auto width | Centred, buttons side by side |

Rules:
- No horizontal scroll. Long names, providers and descriptions clamp to two lines. Emails never appear here.
- Money stays right-aligned in tables and in card lists, at every width.
- Tables become cards on phone (`ResponsiveList` below `md`, `DataTable` from `md`). Both are rendered from the same rows.
- Toasts sit 16 px above the bottom nav on phone.

---

## 11. API field list (check against HEM-018 to HEM-023)

Field names are the API's. The UI field and its control are given so the engineer can map them. Fields marked (Q1, Q2, Q5, Q10) were decided in section 13 and must be added to the ticket named there.

**Shape rule (N13, PM decision Q12 in section 13).** There are two shapes, and each endpoint uses one of them as stated in its subsection:
- **Records keep flat fields.** Contracts (11.2), expenses (11.4), income sources (11.5) and income entries (11.6) have a flat `amount` (a decimal string) and a flat `currency` (ISO-4217). The forms post them that way.
- **Computed values use Money.** Money is `{amount, currency}`, with `amount` as a decimal string (Q2). It is used for the upcoming event `amount` (11.3), the dashboard totals (11.7) and `base_amount` on expenses and income entries (Q1, 11.4 and 11.6).

No other field is a Money object. A `Money` value and a flat amount are never mixed on the same record.

### 11.1 Categories (HEM-018)

| API field | Type | Used for | Notes |
|---|---|---|---|
| `id` | uuid | option value, `category_id` | |
| `key` | string | grouping (`insurance.home` is under Insurance) | |
| `parent_key` | string, nullable | group heading | |
| `kind` | `expense` or `income` | which picker lists it | |
| `space_id` | uuid, nullable | "Your categories" group when set | null for system categories |
| `name` (Q5) | string, required | the option label | Add to HEM-018. System names are seeded. Custom names are required on create. |

### 11.2 Contracts (HEM-018)

| API field | UI control | Type and rule |
|---|---|---|
| `id` | route `/contracts/[id]` | uuid |
| `space_id` | not shown | uuid |
| `category_id` | Category (`CategorySelect`) | uuid, required |
| `name` | Name | string, required |
| `provider` | Provider (optional) | string, nullable |
| `amount` | `AmountInput` | Decimal string (`"4350.00"`), required, above 0 |
| `currency` | `AmountInput` currency | ISO-4217, required |
| `frequency` | Billed (`FrequencySelect`) | `weekly`, `monthly`, `quarterly`, `semiannual`, `annual` |
| `start_date` | Starts | date, required |
| `end_date` | Ends (optional) | date, nullable, on or after `start_date` |
| `auto_renew` | Renews automatically (`CheckboxRow`) | bool |
| `renewal_term_months` | Renews every (months) | int 1 to 120, nullable (default 12 when auto-renew) |
| `notice_period_days` | Notice period (days) | int 0 or more, nullable |
| `member_user_id` | Applies to | uuid, nullable (null is the whole household) |
| `status` | Filter; detail actions | `active` or `cancelled` |
| `notes` | Notes (optional) | string, nullable, max 500 |
| `schedule.next_payment_date` | Schedule card, Next payment, list | date, nullable. Read-only. |
| `schedule.renewal_date` | Schedule card, Renews | date, nullable. Read-only. |
| `schedule.notice_deadline` | Schedule card, Notice deadline | date, nullable. Read-only. |
| `created_by`, `created_at`, `updated_at` | not shown | |

Filters: `status`, `category`, `member_user_id`. Pagination: `items` and `next_cursor` (the `Page` envelope in `core/pagination.py`).

**Shape: flat `amount` and `currency`** (record).

### 11.3 Upcoming events (HEM-018)

`GET /api/v1/spaces/{space_id}/contracts/upcoming?days=30`

**Shape: computed event, `amount` is Money** (the upcoming event amount, Q2). This is the one event shape used on the dashboard too (11.7).

| API field | UI | Notes |
|---|---|---|
| `date` (Q2) | date | Calendar date. The due chip (3.8) is computed from it. |
| `type` | `payment`, `renewal` or `notice_deadline` | Label and icon (6.3, 7.1). |
| `contract_id` | contract link | uuid |
| `contract_name` (Q2) | contract name | string. The record's `name`, read from the contract. |
| `amount` (Q2) | amount on the right | Money `{amount, currency}`, or null for `notice_deadline`. Not shown when null. The currency is inside the Money object, not a sibling field. |

### 11.4 Expenses (HEM-019)

| API field | UI control | Notes |
|---|---|---|
| `id` | row and edit | uuid |
| `category_id` | Category (`CategorySelect`) | uuid, required |
| `amount`, `currency` | `AmountInput` | Decimal string, required, above 0 (flat record fields) |
| `spent_on` | Spent on (date) | required, default today |
| `description` | Description (optional, max 120) | nullable |
| `merchant` | Merchant (optional, max 80) | nullable |
| `contract_id` | Linked contract (optional) | uuid, nullable. Same space. `SET NULL` on delete. |
| `member_user_id` | Applies to | uuid, nullable |
| `base_amount` (Q1) | `ConvertedAmount` | Money or null. The caller's base currency, at the record's date. Null hides the line. Added by HEM-019 once HEM-020 exists. |

Filters: `from`, `to` (inclusive), `category`, `member_user_id`, `contract_id`. Order: newest date first. `spent_on` may be at most one day in the future (Q10).

**Shape: flat `amount` and `currency`** (record). `base_amount` is the one Money field on the record.

### 11.5 Income sources (HEM-019)

| API field | UI control | Notes |
|---|---|---|
| `id` | card and edit | uuid |
| `name` | Name | string, required |
| `type` | Type select | `salary`, `business`, `other` |
| `amount`, `currency` | `AmountInput` ("Typical amount" when irregular) | Decimal string, required |
| `frequency` | How often (`FrequencySelect` with irregular) | the contract enum plus `irregular` |
| `member_user_id` | Applies to | uuid, nullable |
| `active` | Active (`CheckboxRow`) | bool, default true |

**Shape: flat `amount` and `currency`** (record).

### 11.6 Income entries (HEM-019)

| API field | UI control | Notes |
|---|---|---|
| `id` | row and edit | uuid |
| `source_id` | From source (optional) | uuid, nullable, `SET NULL` on source delete |
| `amount`, `currency` | `AmountInput` | Decimal string, required, above 0 |
| `received_on` | Received on | date, required |
| `description` | Description (optional) | nullable |
| `member_user_id` | Applies to | uuid, nullable |
| `base_amount` (Q1) | `ConvertedAmount` | as for expenses (Money or null) |

Filters: `from`, `to` (inclusive), `source_id`. Order: newest date first. `received_on` may be at most one day in the future (Q10).

**Shape: flat `amount` and `currency`** (record). `base_amount` is the one Money field on the record.

### 11.7 Dashboard (HEM-023)

`GET /api/v1/spaces/{space_id}/dashboard?month=YYYY-MM`

**Shape: Money for each total, and `upcoming` uses the 11.3 event shape** (computed values). `base_currency` is a plain ISO-4217 string, because each total carries its own currency.

| API field | UI | Notes |
|---|---|---|
| `month` (Q2) | the hint month, "November 2026" | `YYYY-MM`, echoed back from the request. |
| `base_currency` (Q2) | currency of the unconverted hint | ISO-4217 string, not Money. The Money values below carry their own currency. |
| `spent_this_month` | "Spent this month" | Money |
| `recurring_monthly` | "Recurring cost" | Money, a monthly amount |
| `income_this_month` | "Income this month" | Money |
| `upcoming` | "Next 30 days" | Up to 10 events, the 11.3 shape: `date`, `type`, `contract_id`, `contract_name`, `amount` (Money or null) |
| `unconverted_count` | the hint in 7.1 | int, 0 or more |

### 11.8 Members (HEM-012)

Used only for the "Applies to" options: the member's user id and display name. No email address is needed on these screens.

---

## 12. Components

### 12.1 Existing components used

| Component | Where | Notes |
|---|---|---|
| `PageHeader` | every screen | back link, breadcrumb, `SpaceBadge`, primary action, "..." menu |
| `SpaceBadge` (`md`, `sm`) | headers, forms, rows in households | |
| `HemCard` | cards, totals, schedule | `interactive` for list cards |
| `MoneyText` | every amount | `size` and `showCode` as in 3.2 |
| `DataTable`, `ResponsiveList` | contracts, expenses, income, sources | shown from `md` and below `md`, same rows |
| `ResponsiveDialog` | forms, filter sheet, alerts | `alert` for confirmations |
| `EmptyState` | empty states | `page` and `inline` |
| `Skeleton` | loading | same dimensions as the content |
| `FormMessage` | errors, success, the unconverted hint (`info`) | |
| `Field` | text and date fields | Moves to `components/ui/` in HEM-021 (Q6). |
| `Button`, `Input`, `Label`, `NativeSelect` | controls | |
| `Badge` | "Cancelled", "Paused" (outline) | |
| `DropdownMenu` | detail page "..." menu | items at least 44 px |

### 12.2 New presentational components (`web/src/components/ui/`)

Each takes props only, has no data fetching, and contains no business logic. Each is built in this ticket.

| File | Component | Purpose | Key props |
|---|---|---|---|
| `amount-input.tsx` | `AmountInput` | Amount text field with a currency select, full row (3.1) | `id`, `name`, `label`, `value`, `onValueChange`, `currency`, `currencyOptions` (code as `label`), `onCurrencyChange`, `decimalSeparator`, `fractionDigits`, `placeholder`, `hint`, `error` (amount), `currencyError`, `required` (amount, `aria-required`), `disabled`, `autoFocus` |
| `converted-amount.tsx` | `ConvertedAmount` | Base-currency equivalent in muted text, or nothing (3.3) | `originalCurrency`, `baseCurrency`, `converted` (Money or null; null renders nothing, Q13), `locale` |
| `category-select.tsx` | `CategorySelect` | Grouped native select (3.4) | `id`, `name`, `label`, `groups`, `value`, `onValueChange`, `emptyLabel`, `emptyDisabled`, `required` (`aria-required`), `hint`, `error` |
| `frequency-select.tsx` | `FrequencySelect` (plus `FREQUENCY_LABEL` and `FREQUENCY_PHRASE`) | Frequency picker and amount phrases (3.5). `FREQUENCY_PHRASE.irregular` is empty. | `id`, `name` (default `frequency`), `label`, `value`, `onValueChange`, `includeIrregular`, `required` (`aria-required`), `hint`, `error` |
| `applies-to-select.tsx` | `AppliesToSelect` | "Applies to" picker (3.7) | `id`, `name` (default `member_user_id`), `label`, `options`, `value` (`""` is the whole household), `onValueChange`, `wholeLabel`, `hint`, `error` |
| `due-chip.tsx` | `DueChip` | Due-date status with icon and words (3.8) | `tone` (`later`, `soon`, `overdue`), children |
| `month-header.tsx` | `MonthHeader` | Month group heading, an `h2` (F10) | `title`, `summary` |
| `stat-card.tsx` | `StatCard` | Dashboard total, a labelled section (7.1) | `title`, `value`, `hint` |
| `form-section.tsx` | `FormSection` | Fieldset with a legend for long forms (3.10) | `title`, `description` |
| `checkbox-row.tsx` | `CheckboxRow` | Native checkbox with a 44 px label row (4.3, 6.3) | `id`, `name`, `checked`, `onCheckedChange`, `label`, `description` |

Notes:
- `MoneyText` already exists. It reads the base currency and locale from `FormatProvider` when the props are missing. This is kept for other screens. The finance screens pass `currency` and `locale` explicitly (3.2).
- **Textarea (N10).** The contract Notes field needs a `Textarea`. HEM-021 owns it and creates `web/src/components/ui/textarea.tsx` as its first web change, before the contract form uses it. Style it like `Input` (`min-h-22`, 16 px text, `--input` border, `aria-invalid` and focus styles as `Input`). It is a presentational primitive, with no logic.
- The pickers repeat the error markup for now. Once HEM-021 moves `FieldError` to `components/ui/`, they use it (Q6).

---

## 13. PM decisions

The PM answered the questions raised while writing this spec. The decisions are applied in sections 2 to 12 and are final for HEM-021 to HEM-023 unless the PM changes them.

| # | Question | Decision | Applied in |
|---|---|---|---|
| Q1 | **Converted amounts in list responses.** The UI needs a base-currency equivalent for "About EUR 48.11". | **Accepted.** Expense and income-entry responses get `base_amount`, which is Money or null, in the caller's base currency at the record's date. HEM-019 adds it once the FX service from HEM-020 exists. Until then the UI hides the "About …" line when it is null. | F3, 3.3, 5.1, 6.1, 11.4, 11.6 |
| Q2 | **Field names not in the tickets.** | **Field names.** Upcoming events have `date`, `type` (`payment`, `renewal`, `notice_deadline`), `contract_id`, `contract_name` and `amount` (Money). Money is `{amount, currency}`, with `amount` as a decimal string. The dashboard response has `month` (YYYY-MM), `base_currency`, `spent_this_month`, `recurring_monthly` and `income_this_month` (each Money), `upcoming[]` and `unconverted_count`. Month totals are not returned (F10). | 3.2, 7.1, 11 |
| Q3 | Due-date thresholds: 7 days for payments and renewals, 30 days for notice deadlines. | **Confirmed.** | F6, 3.8 |
| Q4 | Custom categories: where does a user create or rename one? | **No UI in Phase 3.** The category picker shows the system categories plus the space's existing custom categories. Creating custom categories is a board follow-up. | 1, 3.4 |
| Q5 | Category names. | **Accepted.** Categories have a `name` field. | 3.4, 11.1 |
| Q6 | Shared `FieldError` and `Field`. | **Accepted.** Move `Field` and `FieldError` to `components/ui/` in HEM-021, the first web ticket. | 3.6, 12.1, 12.2 |
| Q7 | Contract form as a dialog or a page on desktop. | **Accepted.** Keep the contract form as a dialog (sheet on phone, centred dialog from `md`). | F7, 4.3 |
| Q8 | Currency display format for converted amounts. | **Confirmed:** "≈ SEK 1,234.00". | F21, 3.3 |
| Q9 | Dashboard header action. | **Confirmed:** "Add an expense". | F17, 7.1 |
| Q10 | Expense future dates. | **Accepted.** Expense and income dates may be at most one day in the future. The API validates this in HEM-019. A later date shows "The date cannot be more than a day in the future." | 3.6, 5.2, 6.2, 11.4, 11.6 |
| Q11 | Playwright screenshots for the new components. | **Yes.** HEM-021 to HEM-023 attach Playwright screenshots at 375, 768 and 1280 px for the states in sections 4 to 7. The reviewer checks them against those sections. | 14 |
| Q12 | Record amounts or Money objects (review round 1, N13). | **Records keep flat `amount` and `currency`** (contracts, expenses, income sources and entries). **Computed values use Money**: the upcoming event `amount` (with `contract_name`), the dashboard totals, and `base_amount`. Section 11 states the shape per endpoint. | 3.2, 11 |
| Q13 | Converted amount with no rate: what does `ConvertedAmount` show? (review round 1, the open question on `converted-amount.tsx`). | **The spec wins.** When `converted` is null, `ConvertedAmount` renders nothing. The text "No SEK to EUR rate…" is removed. The dashboard's `unconverted_count` hint is the only place that reports missing rates (7.1). | 3.3, 7.1, 12.2 |

**Board follow-ups from these decisions**
- HEM-018: `name` on categories (Q5), and the upcoming event fields (Q2).
- HEM-019: `base_amount` once HEM-020 exists (Q1), and the one-day future limit (Q10).
- HEM-023: the dashboard fields (Q2).
- HEM-021: the `Textarea` primitive in `web/src/components/ui/textarea.tsx` (N10).
- A category creation screen, later (Q4).

---

## 14. Acceptance check (for the reviewer)

- [ ] Each screen (contracts list and detail, contract form, expenses list, quick add, income entries, income sources, source form, dashboard, first run) is checked at 375, 768 and 1280 px. No horizontal scroll (`document.documentElement.scrollWidth <= clientWidth`).
- [ ] Tap targets are at least 44 × 44 px on every control in the wireframes.
- [ ] Bottom nav at 375 only. Icon rail from 768. Sidebar at 1280.
- [ ] Tables become card lists on phone, with the amount on the right in both.
- [ ] Dialogs are bottom sheets on phone and centred dialogs from 768. The contract form is `md:max-w-lg`, and every other form is `md:max-w-md`.
- [ ] The income sources table at 768 has three columns (Name, Amount, Status) and no clipped column.
- [ ] `AmountInput` takes a full row in every form. Only Starts and Ends, and Renews every and Notice period, share a row.
- [ ] The space badge is on every finance page header and form header, and matches the 2 px accent line.
- [ ] Every list has an empty state, a loading state and an error state (section 4 to 7). Each empty state has one next action, or none when the header already offers it.
- [ ] Amounts use the API's decimal strings, `MoneyText`, `tabular-nums`, and the right alignment.
- [ ] Converted amounts show "About" for screen readers, and nothing when `base_amount` is null.
- [ ] Every destructive action has a confirmation with the action's name on the button, and "Keep" as the dismiss (3.11).
- [ ] Field names in the forms equal the API field names (section 11), so server errors map to fields.
- [ ] Contrast of warning chips and muted text passes 4.5:1 in both themes.
- [ ] Focus rings are visible in both themes.
- [ ] The page works with reduced motion (no slides, no pulsing).
- [ ] Playwright screenshots at 375, 768 and 1280 px are attached to HEM-021 to HEM-023 (Q11).
