# Profile (HEM-011)

Status: v1 (HEM-011). Owner: Designer. Built by: HEM-011 (`/profile`).
Related: `design-system.md` (tokens, type, focus, dialogs, empty states), `app-shell.md` (shell, page header, nav).

## 1. Purpose

Let a signed-in user keep their own details (display name, phone, base currency, locale) and their addresses up to date. The page is account-level, not space-level, so it carries no space badge. Base currency and locale set how every amount and date in the app is shown.

The page has three parts, in this order:

1. **Your details**: one form, one Save button.
2. **Addresses**: a list of cards with add, edit, set-default and delete. Add and edit use a dialog (a bottom sheet on phone). Delete uses a confirmation.
3. **Danger zone**: a disabled placeholder for account deletion.

## 2. Components used

| Area | Components |
|---|---|
| Header | `PageHeader` (title, description; no `space` prop) |
| Details | `HemCard`, `Field` (label, input, hint, inline error), `Combobox` (phone country, currency, address country), `NativeSelect` (locale), `Button`, `FormMessage` (success and form errors) |
| Addresses | `HemCard`, `Badge` (Default), `Button` (outline and ghost, `sm`), `EmptyState` (inline), `FormMessage` |
| Dialogs | `ResponsiveDialog` (dialog on md+, bottom sheet on phone), `ResponsiveDialog alert` for delete (`alertdialog`) |
| Loading | `Skeleton` with a screen-reader line |
| Danger zone | `HemCard` (destructive border), disabled `Button` |

## 3. Wireframes

### 3.1 Phone (375 px)

```
+-------------------------------------------+
| [H]        [ Personal v ]  (bell) (exit)  |  top bar (space switcher stays)
+-------------------------------------------+
| Profile                                   |  text-h1
| Your details, currency and addresses.     |  text-lead
|                                           |
| +---------------------------------------+ |
| | Your details                          | |  HemCard
| | Display name                          | |
| | [____________________________]        | |  44 px input
| | Shown to the people you share ...     | |  hint
| | Email                                 | |
| | [__________________________ (grey)]   | |  read-only
| | This is the address you sign in ...   | |
| | Phone                                 | |
| | [ Netherlands (+31)          v ]      | |  44 px combobox, full width
| | [____________________________]        | |  44 px tel input, full width
| | Optional. Pick the country, then ...  | |
| | Base currency                         | |
| | [ EUR                        v ]      | |
| | Totals and reports are shown in ...   | |
| | Example: EUR 1,240.50                 | |  live example (see 6.4)
| | Locale                                | |
| | [ English                    v ]      | |
| | [          Save changes            ]  | |  full width, 44 px
| +---------------------------------------+ |
|                                           |
| Addresses                                 |  text-h2
| Places you use for home, work or ...      |
| [          Add address             ]      |  full width
|                                           |
| +---------------------------------------+ |
| | Home                       (Default)  | |  compact row (see 5.3)
| | Street 1, 3511 AB Utrecht,            | |
| | Netherlands                           | |  address summary, max 2 lines
| | [Edit] [Delete]                       | |  44 px targets
| +---------------------------------------+ |
| | Office                                | |
| | ...                                   | |
| +---------------------------------------+ |
|                                           |
| +---------------------------------------+ |
| | Danger zone                           | |  destructive border
| | Deleting your account will remove ... | |
| | [ Delete account (coming soon) ]      | |  disabled
| +---------------------------------------+ |
+-------------------------------------------+
| Dashboard  Contracts  Reports  Alerts More|  bottom nav
+-------------------------------------------+
```

### 3.2 Tablet (768 px)

Icon rail (72 px) plus content, 24 px gutter. Form card is capped at `max-w-3xl`. Address cards go in two columns.

```
+--+----------------------------------------------------+
|R | Profile                                            |
|a | Your details, currency and addresses.              |
|i | +------------------------------------------------+ |
|l | | Your details                                   | |
|  | | Display name  [______________________________] | |
|  | | Phone  [ Netherlands (+31) v ] [______________] | |  country and number side by side from md
|  | | Base currency [ EUR v ]                        | |
|  | | Locale [ English v ]                           | |
|  | | [ Save changes ]                               | |  auto width
|  | +------------------------------------------------+ |
|  | Addresses                 [ Add address ]          |
|  | +--------------------+ +--------------------+      |
|  | | Home   (Default)   | | Office             |      |
|  | | ...                | | ...                |      |
|  | | [Edit] [Delete]    | | [Set as default]   |      |
|  | +--------------------+ +--------------------+      |
|  | +------------------------------------------------+ |
|  | | Danger zone ...                                | |
|  | +------------------------------------------------+ |
+--+----------------------------------------------------+
```

### 3.3 Desktop (1280 px)

Sidebar (256 px) with "Profile" under Account, content with 32 px gutter. Same layout as tablet, with the sidebar in place of the rail.

```
+-----------+-----------------------------------------------+
| Account   | Profile                                       |
|  Household| Your details, currency and addresses.         |
|  Profile *| +-------------------------------------------+ |
|           | | Your details                              | |
|           | | Display name [__________________________] | |
|           | | Phone [ Netherlands (+31) v ] [__________] | |
|           | | ...                                       | |
|           | | [ Save changes ]                          | |
|           | +-------------------------------------------+ |
|           | Addresses                  [ Add address ]    |
|           | +--------------------+ +--------------------+ |
|           | | Home  (Default)    | | Office             | |
|           | +--------------------+ +--------------------+ |
+-----------+-----------------------------------------------+
```

### 3.4 Address dialog (add or edit)

Phone: bottom sheet from the bottom edge, rounded top corners, grabber, max 90% of the screen height. The form scrolls inside the sheet. The footer (primary, then Cancel) stays pinned.

Desktop and tablet: centred dialog, `max-w-md`.

```
Phone                                  Desktop
+-------------------------------+      +--------------------------------+
|        ---                    |      | Add address                 x  |
| Add address                 x |      | Where should we send things... |
| Where should we send things,  |      | Name                           |
| or which address ...          |      | [Home                       ]  |
| Name                          |      | Street and number              |
| [Home                      ]  |      | [                           ]  |
| Street and number             |      | Address line 2 (optional)      |
| [                          ]  |      | [                           ]  |
| Address line 2 (optional)     |      | Postcode  [        ] City [   ] |
| [                          ]  |      | Region (optional)              |
| Postcode [      ] City [    ] |      | [                           ]  |
| Region (optional)             |      | Country [ Netherlands    v ]   |
| [                          ]  |      | [ ] Make this my default       |
| Country [ Netherlands    v ]  |      |                                |
| [ ] Make this my default      |      |        [Cancel] [Add address]  |
+-------------------------------+      +--------------------------------+
| [        Add address        ] |  footer, pinned
| [          Cancel           ] |
+-------------------------------+
```

### 3.5 Delete confirmation

Phone: bottom sheet (`alertdialog`). Desktop: centred dialog. Cancel is focused first. It does not close on an outside tap or while the request runs.

```
Phone                                  Desktop
+-------------------------------+      +--------------------------------+
|        ---                    |      | Delete this address?        x  |
| Delete this address?          |      | Office will be removed. This   |
| Office will be removed. This  |      | cannot be undone.              |
| cannot be undone.             |      |                                |
+-------------------------------+      |          [Cancel] [Delete addr]|
| [   Delete address    ] red   |      +--------------------------------+
| [       Cancel         ]      |
+-------------------------------+
```

## 4. Responsive behaviour

| Width | Layout | Address list | Dialogs | Buttons |
|---|---|---|---|---|
| 375 | One column, 16 px gutter | One card per row | Bottom sheets | Save and Add address are full width (44 px) |
| 768 | Icon rail, 24 px gutter, form capped at 3xl | Two columns (`md:grid-cols-2`) | Centred dialogs | Auto width |
| 1280 | Sidebar, 32 px gutter | Two columns | Centred dialogs | Auto width |

Rules:
- Phone country and number stack (country on top). From md the country takes 14 rem and the number fills the rest.
- No horizontal scroll at any width. Long addresses wrap, they do not overflow.
- Every tap target is at least 44 px, including the checkbox row and the combobox options.
- Form grid for postcode and city: 8 rem and the rest of the row, at all widths.

## 5. Address cards

### 5.1 Content
- Name (`text-h3`), and a Default badge when the address is the default.
- Address summary (`text-body`, muted): street, then postcode and city, then region if set, then country. Empty parts are skipped.
- Actions: **Set as default** (not shown on the default address), **Edit**, **Delete**.

### 5.2 Action labels and accessible names
| Visible | Accessible name |
|---|---|
| Set as default | Set {name} as default |
| Edit | Edit {name} |
| Delete | Delete {name} |

### 5.3 Phone compact row (decision for nit 9)
- Address summary is clamped to two lines, so each card stays under about 120 px tall when the card has no region.
- The three actions sit in one row, all at 44 px, with 8 px gaps.
- Cards keep their order from the API; the default is not moved to the top.

### 5.4 Badge (decision for nit 10)
- The Default badge uses `text-caption` (12 px, medium) with a star icon and the word "Default". Colour is not the only signal.
- This is a status tag inside a card, so 12 px is allowed. `design-system.md` section 3 should list "badges" next to "nav labels and chart axes" when the next design-system change is made.

## 6. Form details

### 6.1 Fields
| Field | Input | Hint | Validation |
|---|---|---|---|
| Display name | text, max 80 | "Shown to the people you share a household with." | Over 80: "Use at most 80 characters." |
| Email | read-only, no `name` (never posted) | "This is the address you sign in with. Changing it is not available yet, so keep using this one for now." | none |
| Phone country | combobox (countries, with dial code) | Shown with the phone field | If a number is typed without "+" and no country is chosen: "Choose the country this number belongs to." |
| Phone number | tel | "Optional. Pick the country, then type the number. We save it in international format." | API 422: "Not a valid phone number." |
| Base currency | combobox (ISO-4217, searchable) | "Totals and reports are shown in this currency. Example: {money}" | Not from list: "Choose a currency from the list." |
| Locale | native select | "Sets how numbers and dates are written." | API 422 shown inline |

Placeholders: phone "6 1234 5678"; currency "Search, for example EUR or Euro"; phone country "Country".

### 6.2 Comboboxes on phone
- Opening the field shows the list directly under it, inside the sheet or the page. Options are 44 px.
- "No match. Try another search." when nothing matches. The count is announced politely.
- Keyboard: arrows, Enter to pick, Escape to close. Enter inside the list does not submit the form.
- Acceptance check (nit 8): at 375 px, with the Add address sheet open, the country list opens and every option can be reached by scrolling inside the sheet, with no clipping and no need to leave the sheet. If it is clipped, the list is rendered in a layer above the sheet.

### 6.3 Save behaviour
- The Save button is disabled until the page has loaded in the browser, so the form cannot be posted as a plain form.
- Inputs are uncontrolled. Nothing typed before the page is ready is lost.
- On submit, client checks run first. Then a request. Focus moves to the first invalid field, and errors are announced politely.

### 6.4 Money example (decision for nit 4)
- The example in the currency hint follows the currency being selected, as the user picks it. It uses the saved locale.
- It is formatted with `Intl.NumberFormat` (through `formatMoney`), never built by hand. Example amount: `1240.50`.
- Once the user saves, the example is the same as the saved currency.

### 6.5 Heading levels
- Page: `h1` "Profile". Sections: `h2` "Your details", "Addresses", "Danger zone". Address names: `h3`. The empty-state title is `h3` (decision for nit 5).

## 7. States

### 7.1 Profile page
| State | What the user sees | Copy | Notes |
|---|---|---|---|
| Loading | Two skeleton blocks (form and addresses), `aria-busy` on the region, screen-reader text "Loading your profile" (decision for nit 7) | (sr only) "Loading your profile" | Shown while the page loads on the server and on the client |
| Load error | Alert in a destructive-subtle box, with a **Retry** button (44 px). Retry reloads the page data (decision for nit 6) | "We could not load your profile just now. Reload the page to try again." Button: "Retry" | `role="alert"` |
| Populated | Form with saved values, the address list, danger zone | none | Default, populated and dark states are in the screenshot set |
| Saving | Save button shows the busy label and keeps its width. `aria-busy` on the form | Button: "Saving…" (decision for nit 3) | Second submit is ignored while busy |
| Saved | Success message above the form, polite | "Profile saved." | Cleared on the next edit |
| Field error | Red border, `aria-invalid`, inline text under the field, focus moved to the first invalid field | see 6.1 | Errors clear on the next submit |
| Form error (422 without a field, or network) | Alert above the form | "Check the highlighted fields and try again." or "We could not reach the server. Check your connection and try again." | `role="alert"` |

### 7.2 Addresses
| State | What the user sees | Copy |
|---|---|---|
| Empty | Inline empty state in a card, 40 px icon, title as `h3`, and an **Add address** button | Title: "No addresses yet". Body: "Add your home address and any others you use. Your first one becomes the default." Button: "Add address" |
| Populated | Cards in one column (phone) or two (md+). Default card has the badge | Section text: "Places you use for home, work or billing. One of them is your default." |
| Set-default busy | The clicked card's button shows the busy label, others are disabled | "Saving…" |
| Set-default success | Success message above the list | "{name} is now your default address." |
| Set-default error | Error message above the list | Server message, or "We could not reach the server. Check your connection and try again." |
| At the limit (20) | Add address button disabled. Warning notice above the list | "You have reached the limit of 20 addresses. Delete one you no longer use to add another." |
| Added | Success message above the list | "Address added." |
| Saved (edit) | Success message above the list | "Address saved." |

### 7.3 Address dialog
| State | What the user sees | Copy |
|---|---|---|
| Add, empty | Title and description, empty fields. Checkbox "Make this my default address", or the first-address note | Title: "Add address". Description: "Where should we send things, or which address do your documents use?" Checkbox: "Make this my default address". First-address note: "Your first address becomes your default address." |
| Edit | Title only (no description), fields filled. No checkbox | Title: "Edit address". Button: "Save address" |
| Field errors | Each field's error under it. Focus moves to the first invalid field | Name: "Give the address a name, for example Home." Street: "Enter the street and number." City: "Enter the city or town." Country: "Choose a country." or "Choose a country from the list." Length: "Use at most {n} characters." |
| Saving | Primary button busy, Cancel and close disabled | "Saving…" |
| Limit (409 on add) | Friendly message at the top of the form. The dialog stays open | "You have reached the limit of 20 addresses. Delete one you no longer use to add another." |
| Network error | Message at the top of the form | "We could not reach the server. Check your connection and try again." |

Footer buttons: primary first, then Cancel. Stacked full width on phone, right-aligned on md+.

### 7.4 Delete confirmation
| State | What the user sees | Copy |
|---|---|---|
| Confirm | Title, description, destructive "Delete address", then "Cancel" (focused first) | Title: "Delete this address?" Body: "{name} will be removed. This cannot be undone." |
| Confirm, default address | As above, with the default warning | "{name} is your default address. After deleting it you will have no default until you choose another. This cannot be undone." |
| Deleting | Both buttons disabled, dismiss blocked | "Deleting…" |
| Deleted | Dialog closes, success message, focus moves to the section heading | "{name} was deleted." |
| Already gone (404) | Treated as deleted | Same as Deleted |
| Error | Error message inside the dialog, dialog stays open | Server message, or the network message |

### 7.5 Danger zone
Always disabled in this version.

- Text: "Deleting your account will remove your profile, addresses and personal space for good. This is not available yet. It will arrive in a later update, with a way to export your data first."
- Button: "Delete account (coming soon)", disabled, linked to the text with `aria-describedby`.

## 8. Decisions on the Round 1 nits

| # | Nit | Decision |
|---|---|---|
| 3 | Busy labels have no progress cue | Busy labels use "…" ("Saving…", "Deleting…"), keep the button width, and set `aria-busy`. No spinner. |
| 4 | Money example shows the saved currency | The example follows the currency being picked (6.4). |
| 5 | Empty-state title is h2 | Title is `h3`. |
| 6 | Load error has no action | Adds a Retry button (44 px). |
| 7 | Skeleton has no screen-reader text | Adds "Loading your profile" (sr only). |
| 8 | Combobox may clip in the sheet | Acceptance check in 6.2. Clipping would make this blocking. |
| 9 | Long phone cards | Compact phone row (5.3). |
| 10 | Default badge is 12 px | Keep 12 px caption for badges (5.4). |

Not on Profile, as decided in Round 1: the space badge. The page header renders without a `space` prop.

## 9. Accessibility
- Every input has a visible label. Hints and errors are linked with `aria-describedby`. Invalid fields have `aria-invalid`.
- Errors are announced: inline errors politely, form-level errors with `role="alert"`, success with `role="status"`.
- Focus ring: 2 px `--ring`, 2 px offset, `:focus-visible` only. The ring is visible in both themes.
- Dialog: `role="dialog"`, or `alertdialog` for delete. Focus trapped, Escape closes (except delete while busy), focus returns to the trigger on close.
- Reduced motion: sheets and dialogs do not animate. Transitions drop to 0 ms.
- Colour is never the only signal: errors have an icon and text, the default has a star and the word "Default", and destructive actions have text.

## 10. Dark theme
- All colours come from tokens. Text on fills uses the `-foreground` token.
- The read-only email uses `--muted` with `--muted-foreground` (6.1:1 light, 6.4:1 dark).
- Destructive text uses `--destructive` (6.5:1 light, 6.3:1 dark on the background).
- Checked in the dark populated and empty screenshots at 375 px.

## 11. Content
- Sentence case throughout. No exclamation marks. No "Oops".
- Plain words: "address", "currency", "locale" (with the hint "Sets how numbers and dates are written").
- The account text says "coming soon" once, in the button. The danger zone explains why.
- Example data in the spec and in screenshots is fictional. Real names, emails, phone numbers and addresses are never written into the spec or the review.
