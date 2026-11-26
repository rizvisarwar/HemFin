# HemFin Design System

Status: v1 (HEM-002). Owner: Designer. Used by: HEM-003 (web shell) and every later screen.

HemFin is a household finance app. Most users are not finance experts, and they are managing money that matters to their family. The interface should feel **calm, plain-spoken and trustworthy**: quiet surfaces, generous spacing, numbers that are easy to read, and no alarm colours unless something really needs attention.

---

## 1. Brand feel

| Quality | What it means in the UI |
|---|---|
| Calm | Off-white background, low-contrast borders, no gradients on working screens, no decorative animation. |
| Trustworthy | Deep navy as the primary colour, consistent layout, every number traceable to a record. |
| Clear about privacy | Personal and household data always carry a label, an icon and an accent colour. |
| Plain-spoken | Short sentences, no jargon ("renews on 3 Dec", not "next billing cycle anchor"). |
| Not alarming | Money is shown in neutral text colour. Red is only for errors and destructive actions. Amber is only for things that need attention soon. |

**Do not** use emoji in product UI. **Do not** use money colour to signal good or bad (income is not "green" and spending is not "red"). Direction is shown with a sign and a text label.

---

## 2. Colour tokens

Each colour is a CSS variable that holds a full **`hsl(...)` value** (for example `hsl(218 45% 26%)`). The variables are set on `:root` and `.dark`, and Tailwind CSS v4 maps them to utilities in `@theme inline` (section 2.2). The names follow shadcn/ui so its components work unchanged. HemFin adds the semantic tokens `--success`, `--warning`, `--destructive` and the space accents `--personal` and `--household`.

Tokens live on `:root` (light) and `.dark` (dark). The theme class is applied by `next-themes` with `attribute="class"`, and it follows the OS setting by default.

### 2.1 Light and dark values

| Token | Light (HSL) | Light (hex) | Dark (HSL) | Dark (hex) | Used for |
|---|---|---|---|---|---|
| `--background` | `40 20% 98%` | #FBFAF9 | `215 28% 8%` | #0F131A | Page background |
| `--foreground` | `215 25% 14%` | #1B222D | `210 20% 94%` | #EDF0F3 | Body text, headings |
| `--card` | `0 0% 100%` | #FFFFFF | `215 24% 11%` | #151B23 | Cards, sheets, popovers |
| `--card-foreground` | `215 25% 14%` | | `210 20% 94%` | | Text on cards |
| `--popover` | `0 0% 100%` | | `215 24% 11%` | | Dropdowns, tooltips |
| `--popover-foreground` | `215 25% 14%` | | `210 20% 94%` | | |
| `--primary` | `218 45% 26%` | #243A60 | `218 70% 78%` | #A0BCEE | Primary buttons, active nav, links |
| `--primary-foreground` | `0 0% 100%` | #FFFFFF | `218 40% 12%` | #121B2B | Text on primary |
| `--secondary` | `40 14% 93%` | #F0EEEB | `215 18% 18%` | #262D36 | Secondary buttons |
| `--secondary-foreground` | `215 25% 18%` | | `210 20% 92%` | | |
| `--muted` | `40 14% 94%` | #F2F0EE | `215 18% 16%` | #212830 | Skeletons, empty-state icon circles, table headers |
| `--muted-foreground` | `215 12% 36%` | #515A67 | `215 14% 68%` | #A2ABB9 | Helper text, meta, placeholders |
| `--accent` | `172 30% 93%` | #E8F3F1 | `175 30% 18%` | #203C39 | Hover and selected row backgrounds |
| `--accent-foreground` | `175 50% 20%` | #1A4D48 | `172 50% 75%` | #9FDFD7 | Text on accent |
| `--destructive` | `0 60% 42%` | #AB2B2B | `0 70% 68%` | #E77474 | Delete buttons, error text |
| `--destructive-foreground` | `0 0% 100%` | #FFFFFF | `215 30% 10%` | | Text on destructive buttons |
| `--destructive-subtle` | `0 70% 95%` | #FBE9E9 | `0 35% 17%` | #3B1C1C | Error alert backgrounds |
| `--success` | `152 55% 26%` | #1E6745 | `152 50% 58%` | #5EC997 | Success text and icons |
| `--success-foreground` | `0 0% 100%` | #FFFFFF | `215 30% 10%` | | Text on success fills |
| `--success-subtle` | `152 40% 93%` | #E6F4EE | `152 30% 16%` | #1D352A | Success badges and alerts |
| `--warning` | `32 90% 33%` | #A05908 | `38 90% 62%` | #F5B547 | Warning text and icons ("renews in 7 days") |
| `--warning-foreground` | `0 0% 100%` | #FFFFFF | `215 30% 10%` | | |
| `--warning-subtle` | `40 95% 92%` | #FEF1D7 | `35 40% 17%` | #3D2E1A | Warning badges and alerts |
| `--border` | `40 12% 88%` | #E4E2DD | `215 16% 22%` | #2F3741 | Card and divider borders (decorative) |
| `--input` | `215 10% 52%` | #788391 | `215 12% 45%` | #657081 | Form control borders (3:1 against background, see 2.3) |
| `--ring` | `218 60% 40%` | #2956A3 | `218 75% 78%` | #9DBCF1 | Focus ring |
| `--personal` | `175 55% 27%` | #1F6B64 | `172 50% 60%` | #66CCBE | Personal space accent (text, icon, border) |
| `--personal-foreground` | `0 0% 100%` | #FFFFFF | `215 30% 10%` | | Text on a personal fill |
| `--personal-subtle` | `170 35% 93%` | #E7F3F1 | `175 30% 16%` | #1D3533 | Personal badge background |
| `--household` | `265 40% 42%` | #644096 | `265 65% 78%` | #C1A2EB | Household space accent |
| `--household-foreground` | `0 0% 100%` | #FFFFFF | `215 30% 10%` | | Text on a household fill |
| `--household-subtle` | `265 40% 95%` | #F1EDF7 | `265 30% 18%` | #2C203C | Household badge background |
| `--chart-1` | `175 55% 27%` | | `172 50% 60%` | | Chart series 1 (personal) |
| `--chart-2` | `265 40% 42%` | | `265 65% 78%` | | Chart series 2 (household) |
| `--chart-3` | `218 45% 26%` | | `218 70% 78%` | | Chart series 3 (neutral) |
| `--chart-4` | `32 90% 33%` | | `38 90% 62%` | | Chart series 4 (highlight) |

Space accents are **not** the only signal. Every space appears with its icon and its text label as well (see 2.4).

### 2.2 CSS

```css
/* app/globals.css (HEM-003). Tailwind CSS v4 with current shadcn/ui. */
@import "tailwindcss";

@custom-variant dark (&:is(.dark *));

@layer base {
  :root {
    --background: hsl(40 20% 98%);
    --foreground: hsl(215 25% 14%);
    --card: hsl(0 0% 100%);
    --card-foreground: hsl(215 25% 14%);
    --popover: hsl(0 0% 100%);
    --popover-foreground: hsl(215 25% 14%);
    --primary: hsl(218 45% 26%);
    --primary-foreground: hsl(0 0% 100%);
    --secondary: hsl(40 14% 93%);
    --secondary-foreground: hsl(215 25% 18%);
    --muted: hsl(40 14% 94%);
    --muted-foreground: hsl(215 12% 36%);
    --accent: hsl(172 30% 93%);
    --accent-foreground: hsl(175 50% 20%);
    --destructive: hsl(0 60% 42%);
    --destructive-foreground: hsl(0 0% 100%);
    --destructive-subtle: hsl(0 70% 95%);
    --success: hsl(152 55% 26%);
    --success-foreground: hsl(0 0% 100%);
    --success-subtle: hsl(152 40% 93%);
    --warning: hsl(32 90% 33%);
    --warning-foreground: hsl(0 0% 100%);
    --warning-subtle: hsl(40 95% 92%);
    --border: hsl(40 12% 88%);
    --input: hsl(215 10% 52%);
    --ring: hsl(218 60% 40%);
    --personal: hsl(175 55% 27%);
    --personal-foreground: hsl(0 0% 100%);
    --personal-subtle: hsl(170 35% 93%);
    --household: hsl(265 40% 42%);
    --household-foreground: hsl(0 0% 100%);
    --household-subtle: hsl(265 40% 95%);
    --chart-1: hsl(175 55% 27%);
    --chart-2: hsl(265 40% 42%);
    --chart-3: hsl(218 45% 26%);
    --chart-4: hsl(32 90% 33%);
    --radius: 0.75rem;
  }

  .dark {
    --background: hsl(215 28% 8%);
    --foreground: hsl(210 20% 94%);
    --card: hsl(215 24% 11%);
    --card-foreground: hsl(210 20% 94%);
    --popover: hsl(215 24% 11%);
    --popover-foreground: hsl(210 20% 94%);
    --primary: hsl(218 70% 78%);
    --primary-foreground: hsl(218 40% 12%);
    --secondary: hsl(215 18% 18%);
    --secondary-foreground: hsl(210 20% 92%);
    --muted: hsl(215 18% 16%);
    --muted-foreground: hsl(215 14% 68%);
    --accent: hsl(175 30% 18%);
    --accent-foreground: hsl(172 50% 75%);
    --destructive: hsl(0 70% 68%);
    --destructive-foreground: hsl(215 30% 10%);
    --destructive-subtle: hsl(0 35% 17%);
    --success: hsl(152 50% 58%);
    --success-foreground: hsl(215 30% 10%);
    --success-subtle: hsl(152 30% 16%);
    --warning: hsl(38 90% 62%);
    --warning-foreground: hsl(215 30% 10%);
    --warning-subtle: hsl(35 40% 17%);
    --border: hsl(215 16% 22%);
    --input: hsl(215 12% 45%);
    --ring: hsl(218 75% 78%);
    --personal: hsl(172 50% 60%);
    --personal-foreground: hsl(215 30% 10%);
    --personal-subtle: hsl(175 30% 16%);
    --household: hsl(265 65% 78%);
    --household-foreground: hsl(215 30% 10%);
    --household-subtle: hsl(265 30% 18%);
    --chart-1: hsl(172 50% 60%);
    --chart-2: hsl(265 65% 78%);
    --chart-3: hsl(218 70% 78%);
    --chart-4: hsl(38 90% 62%);
  }

  * {
    @apply border-border;
  }

  :focus-visible {
    outline: 2px solid var(--ring);
    outline-offset: 2px;
  }

  body {
    @apply bg-background text-foreground antialiased;
    font-feature-settings: "cv11", "ss01";
  }
}

/* Map the tokens to Tailwind utilities (bg-primary, text-muted-foreground, bg-personal-subtle, rounded-lg ...). */
@theme inline {
  --color-background: var(--background);
  --color-foreground: var(--foreground);
  --color-card: var(--card);
  --color-card-foreground: var(--card-foreground);
  --color-popover: var(--popover);
  --color-popover-foreground: var(--popover-foreground);
  --color-primary: var(--primary);
  --color-primary-foreground: var(--primary-foreground);
  --color-secondary: var(--secondary);
  --color-secondary-foreground: var(--secondary-foreground);
  --color-muted: var(--muted);
  --color-muted-foreground: var(--muted-foreground);
  --color-accent: var(--accent);
  --color-accent-foreground: var(--accent-foreground);
  --color-destructive: var(--destructive);
  --color-destructive-foreground: var(--destructive-foreground);
  --color-destructive-subtle: var(--destructive-subtle);
  --color-success: var(--success);
  --color-success-foreground: var(--success-foreground);
  --color-success-subtle: var(--success-subtle);
  --color-warning: var(--warning);
  --color-warning-foreground: var(--warning-foreground);
  --color-warning-subtle: var(--warning-subtle);
  --color-border: var(--border);
  --color-input: var(--input);
  --color-ring: var(--ring);
  --color-personal: var(--personal);
  --color-personal-foreground: var(--personal-foreground);
  --color-personal-subtle: var(--personal-subtle);
  --color-household: var(--household);
  --color-household-foreground: var(--household-foreground);
  --color-household-subtle: var(--household-subtle);
  --color-chart-1: var(--chart-1);
  --color-chart-2: var(--chart-2);
  --color-chart-3: var(--chart-3);
  --color-chart-4: var(--chart-4);
  --radius-sm: calc(var(--radius) - 4px);
  --radius-md: calc(var(--radius) - 2px);
  --radius-lg: var(--radius);
  --radius-xl: calc(var(--radius) + 4px);
}
```

There is no `tailwind.config` file. Tailwind v4 reads the `@theme inline` block above, so each token becomes a utility: `bg-background`, `text-muted-foreground`, `border-border`, `ring-ring`, `bg-personal-subtle`, `text-household`, `rounded-lg`. Opacity modifiers such as `bg-primary/50` work on the full `hsl()` value through v4's colour mixing, so the tokens do not need an `<alpha-value>` wrapper. Components from shadcn/ui use the same names, so they work unchanged.

### 2.3 Contrast (WCAG 2.2 AA)

Text needs 4.5:1, large text (24 px or 18.66 px bold and up) needs 3:1, and non-text UI (focus rings, input borders, icons that carry meaning) needs 3:1. Ratios were calculated from the HSL values above.

**Light theme**

| Text | Background | Ratio | Requirement | Result |
|---|---|---|---|---|
| `--foreground` #1B222D | `--background` #FBFAF9 | 15.3:1 | 4.5 | Pass |
| `--foreground` | `--card` #FFFFFF | 16.0:1 | 4.5 | Pass |
| `--muted-foreground` #515A67 | `--background` | 6.7:1 | 4.5 | Pass |
| `--muted-foreground` | `--muted` | 6.1:1 | 4.5 | Pass |
| `--primary-foreground` #FFFFFF | `--primary` #243A60 | 11.4:1 | 4.5 | Pass |
| `--accent-foreground` #1A4D48 | `--accent` | 8.4:1 | 4.5 | Pass |
| `--destructive` #AB2B2B | `--background` | 6.5:1 | 4.5 | Pass |
| `--destructive-foreground` #FFFFFF | `--destructive` | 6.7:1 | 4.5 | Pass |
| `--success` #1E6745 | `--background` | 6.5:1 | 4.5 | Pass |
| `--warning` #A05908 | `--background` | 5.1:1 | 4.5 | Pass |
| `--warning` | `--warning-subtle` | 4.8:1 | 4.5 | Pass |
| `--personal` #1F6B64 | `--background` | 6.0:1 | 4.5 | Pass |
| `--personal` | `--personal-subtle` | 5.5:1 | 4.5 | Pass |
| `--household` #644096 | `--background` | 7.4:1 | 4.5 | Pass |
| `--household` | `--household-subtle` | 6.7:1 | 4.5 | Pass |
| `--ring` #2956A3 | `--background` | 6.8:1 | 3.0 | Pass |
| `--input` #788391 | `--background` | 3.7:1 | 3.0 | Pass |

**Dark theme**

| Text | Background | Ratio | Requirement | Result |
|---|---|---|---|---|
| `--foreground` #EDF0F3 | `--background` #0F131A | 16.3:1 | 4.5 | Pass |
| `--foreground` | `--card` #151B23 | 15.1:1 | 4.5 | Pass |
| `--muted-foreground` #A2ABB9 | `--background` | 8.0:1 | 4.5 | Pass |
| `--muted-foreground` | `--muted` #212830 | 6.4:1 | 4.5 | Pass |
| `--primary-foreground` #121B2B | `--primary` #A0BCEE | 9.0:1 | 4.5 | Pass |
| `--accent-foreground` #9FDFD7 | `--accent` #203C39 | 7.9:1 | 4.5 | Pass |
| `--destructive` #E77474 | `--background` | 6.3:1 | 4.5 | Pass |
| `--destructive-foreground` (dark navy) on `--destructive` #E77474 | `--destructive` | about 5.9:1 | 4.5 | Pass |
| `--success` #5EC997 | `--background` | 9.1:1 | 4.5 | Pass |
| `--warning` #F5B547 | `--background` | 10.3:1 | 4.5 | Pass |
| `--warning` | `--warning-subtle` | 7.2:1 | 4.5 | Pass |
| `--personal` #66CCBE | `--background` | 9.7:1 | 4.5 | Pass |
| `--personal` | `--personal-subtle` | 6.8:1 | 4.5 | Pass |
| `--household` #C1A2EB | `--background` | 8.5:1 | 4.5 | Pass |
| `--household` | `--household-subtle` | 7.0:1 | 4.5 | Pass |
| `--ring` #9DBCF1 | `--background` | 9.7:1 | 3.0 | Pass |
| `--input` #657081 | `--background` | 3.7:1 | 3.0 | Pass |

Rules that go with these numbers:
- Never put `--muted-foreground` on a coloured fill. On `--muted` it is fine (6.1:1), but on any accent fill use `--foreground`.
- Never put a status colour on a status fill other than its own `-subtle` token.
- `--primary` is for filled buttons, active navigation and links. Body text is always `--foreground`.

### 2.4 Space accents (personal vs. household)

The space is the most important context in the app, so it gets a fixed visual signature everywhere.

| Space | Icon (lucide) | Accent token | Label | Badge |
|---|---|---|---|---|
| Personal | `Lock` | `--personal` | "Personal" | Icon + label + `--personal-subtle` fill |
| Household | `Users` | `--household` | Household name (e.g. "The Rizvi family") | Icon + label + `--household-subtle` fill |

Rules:
- Every page that shows finance data shows a **SpaceBadge** next to its title (see `app-shell.md`).
- The top bar's bottom border is 2 px in the active space's accent colour.
- Charts never mix personal and household series in the same chart without a legend.
- Creating a record defaults to the active space. The form shows the space badge in its header, so the user always knows where the record goes.

### 2.5 Money text colours

| Use | Colour |
|---|---|
| Amounts in lists, tables and totals | `--foreground` |
| Secondary amounts (for example, "per month" equivalent) | `--muted-foreground` |
| Upcoming, due soon | `--warning` text plus a clock icon and the words "due in 7 days" |
| Failed or overdue | `--destructive` text plus an alert icon and the word "overdue" |

---

## 3. Typography

**Font:** Inter, loaded with `next/font/google` (`subsets: ["latin"]`, `display: "swap"`), with the fallback stack `ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, sans-serif`. Inter is free and very legible in small sizes, and it has good tabular figures.

**Figures:** every amount, date and count uses `tabular-nums` (`font-variant-numeric: tabular-nums`) so columns line up.

| Token (Tailwind) | Phone (375) size / line | md and up size / line | Weight | Use |
|---|---|---|---|---|
| `text-display` | 32 / 40 | 48 / 56 | 700 | Landing hero only |
| `text-h1` | 24 / 32 | 30 / 38 | 600 | Page title (PageHeader) |
| `text-h2` | 20 / 28 | 22 / 30 | 600 | Section title |
| `text-h3` | 18 / 26 | 18 / 26 | 600 | Card title |
| `text-lead` | 18 / 28 | 18 / 28 | 400 | Intro paragraph under a title |
| `text-body` | 16 / 24 | 16 / 24 | 400 | Running text, form input text |
| `text-body-strong` | 16 / 24 | 16 / 24 | 600 | Row titles, emphasised labels |
| `text-small` | 14 / 20 | 14 / 20 | 400 / 500 | Helper text, meta, timestamps, form errors |
| `text-caption` | 12 / 16 | 12 / 16 | 500 | Bottom-nav labels, chart axes and status badges (for example "Default") only |
| `text-money-lg` | 28 / 36 | 32 / 40 | 600 | Hero totals on the dashboard |
| `text-money` | 16 / 24 | 16 / 24 | 500 | Amounts in lists and tables |

Rules:
- **Body text is never below 16 px.** Helper text (14 px) is allowed for metadata only, never for paragraphs.
- Nothing is below 12 px. Captions are for nav labels, chart axes and status badges only.
- Line length for running text stays under about 70 characters (`max-w-prose` on the body).
- Headings use sentence case ("Your renewals this month"), not Title Case.

---

## 4. Spacing, layout and radius

### 4.1 Spacing scale
We use the Tailwind default 4 px scale. Only these values are used for layout:

| Token | px | Typical use |
|---|---|---|
| `1` | 4 | Icon-to-text gap in badges |
| `2` | 8 | Gap between tightly grouped items |
| `3` | 12 | Gap inside a row |
| `4` | 16 | **Phone side gutter**, card padding on phone |
| `5` | 20 | Card padding on md and up |
| `6` | 24 | **Tablet side gutter**, gap between cards and sections |
| `8` | 32 | **Desktop side gutter**, gap between page sections |
| `12` | 48 | Space above empty-state blocks |

### 4.2 Layout constants

| Constant | Phone (375) | Tablet (768) | Desktop (1280) |
|---|---|---|---|
| Side gutter | 16 px | 24 px | 32 px |
| Top bar height | 56 px | 64 px | 64 px |
| Bottom nav height | 64 px + safe-area inset | none | none |
| Icon rail width | none | 72 px | none |
| Sidebar width | none | none | 256 px |
| Content max width | 100% | 100% | 1120 px (centred in the remaining area) |
| Cards per row | 1 | 2 | 2 or 3 (`min 320 px` each) |
| Min tap target | 44 × 44 px | 44 × 44 px | 44 × 44 px (buttons may be visually smaller, but their hit area is 44 px) |

### 4.3 Radius

| Token | Value | Use |
|---|---|---|
| `rounded-sm` | 8 px | Checkboxes, small chips |
| `rounded-md` | 10 px | Buttons, inputs, selects |
| `rounded-lg` | 12 px | Cards, popovers, tooltips |
| `rounded-xl` | 16 px | Bottom sheets (top corners), dialogs |
| `rounded-full` | 9999 px | Badges, avatars, the space switcher pill |

### 4.4 Elevation

| Level | Light | Dark | Use |
|---|---|---|---|
| 0 | none, border `--border` | none, border `--border` | Cards in a list |
| 1 | `0 1px 2px 0 rgb(15 23 42 / 0.06)` | none (border only) | Cards on the dashboard |
| 2 | `0 8px 24px -8px rgb(15 23 42 / 0.18)` | `0 8px 24px -8px rgb(0 0 0 / 0.5)` | Popovers, dropdowns, sheets, dialogs |

Dark mode relies on the lighter card surface and the border, not on heavy shadows.

### 4.5 Focus
- Every focusable element shows a **2 px `--ring` outline with a 2 px offset** in `--background`, on `:focus-visible` only.
- Never remove the outline without replacing it.

### 4.6 Motion
- Hover and colour changes: 150 ms, `ease-out`.
- Sheet and dialog enter and exit: 200 ms, `ease-out`, with a slide for the bottom sheet and a fade-and-scale for the dialog.
- Under `prefers-reduced-motion: reduce`, sheets and dialogs fade only, with no translation, and transitions drop to 0 ms.

---

## 5. Money and number formatting

Money is the most important content in the app, so the rules are strict.

1. **The API sends amounts as decimal strings** (for example `"1240.50"`) with an ISO-4217 `currency` code. Never convert them to JavaScript `number` for storage or arithmetic. For display, pass the string straight to `Intl.NumberFormat.format`, which keeps the precision in modern engines (ECMA-402 v3).
2. **Format with `Intl.NumberFormat`** using the user's `locale` from their profile (fallback: `en`). Never hand-build currency strings.
3. **Right-align** amounts in tables and lists. Use `tabular-nums`.
4. **Show the currency** in one of these ways:
   - In the **hero total** and single-currency lists: the symbol (`€1,240.00`).
   - In **multi-currency lists** and any row whose currency differs from the space's base currency: the code (`EUR 1,240.00`), using `currencyDisplay: "code"`.
5. **Never round** on the client. Rounding to the currency's minor units is the API's job. Display uses the currency's default fraction digits (2 for EUR, 0 for JPY).
6. **Direction** is shown with a sign and a label, not colour:
   - Expense: no sign, `Expense` in meta text.
   - Income: `+` sign and `Income` in meta text.
   - Negative balances: `-` (the Intl minus sign) and a text label.
7. **Compact notation** (`1.2K`) is only for chart axes. Everywhere else, show the full amount.
8. **Dates** use `Intl.DateTimeFormat` with `{ day: "numeric", month: "short", year: "numeric" }` (for example "3 Dec 2026"). Times are stored in UTC and shown in the user's time zone. Use relative text ("in 3 days") only in notifications and reminders, and always show the absolute date alongside it.

Reference helper (lives in `web/src/lib/format.ts`, built by HEM-003):

```ts
export function formatMoney(
  amount: string,            // decimal string from the API, e.g. "1240.50"
  currency: string,          // ISO-4217, e.g. "EUR"
  locale = "en",
  opts: { code?: boolean; signDisplay?: "auto" | "always" | "exceptZero" } = {},
): string {
  return new Intl.NumberFormat(locale, {
    style: "currency",
    currency,
    currencyDisplay: opts.code ? "code" : "symbol",
    signDisplay: opts.signDisplay ?? "auto",
  }).format(amount); // NumberFormat v3 accepts decimal strings without float loss
}
```

---

## 6. Icons

**Set:** `lucide-react`, the only icon library. Default stroke width 2. Never mix icon sets.

| Size | Use |
|---|---|
| 16 px | Inline with `text-small` (badges, meta rows) |
| 20 px | Buttons, inputs, nav items in the sidebar and top bar |
| 24 px | Bottom-nav icons, card headers |
| 32 px | Empty-state icon (inside a 56 px `--muted` circle) |

Rules:
- Icons with a meaning always have a visible text label or an `aria-label`. Decorative icons get `aria-hidden="true"`.
- Bottom-nav items always show a label.

Navigation and space icons:

| Item | Icon | Item | Icon |
|---|---|---|---|
| Dashboard | `LayoutDashboard` | Income | `Banknote` |
| Contracts | `FileText` | Reports | `BarChart3` |
| Expenses | `Receipt` | Documents | `Paperclip` |
| Notifications | `Bell` | Suggestions | `Lightbulb` |
| More | `Ellipsis` | Assistant | `MessageSquare` |
| Household | `Users` | Profile | `CircleUser` |
| Personal space | `Lock` | Household space | `Users` |

---

## 7. Component inventory and states

Built on shadcn/ui primitives in `web/src/components/ui/`, styled with the tokens above. "Touch target" means the hit area is at least 44 px on phones.

| Component | Variants | States it must show | Notes |
|---|---|---|---|
| **Button** | `default` (primary), `secondary`, `outline`, `ghost`, `destructive`, `link` | default, hover, focus-visible, active, disabled, loading (spinner + same width, `aria-busy`) | Height 44 px on all sizes. Full width on phone for a page's main action. |
| **Input / Textarea** | default | default, hover, focus, filled, invalid (`--destructive` border + message below with an icon), disabled, read-only | Label is always visible above the field. Placeholder is never the label. Min height 44 px. Font 16 px so iOS does not zoom. |
| **Select / Combobox** | single, multi | closed, open, focused option, disabled, empty results | Opens as a bottom sheet on phone. |
| **Checkbox / Switch / RadioGroup** | | unchecked, checked, indeterminate, focus, disabled, invalid | Label is clickable. Hit area 44 px including the label. |
| **Badge** | `neutral`, `personal`, `household`, `success`, `warning`, `destructive`, `outline` | default | Always text plus, where it helps, an icon. Space badges always show the label "Personal" or the household name. |
| **Card** (`HemCard`) | `default`, `interactive` (link-like, hover shows `--accent` border), `muted` | default, hover (interactive only), focus-visible | `rounded-lg`, `--card`, 1 px `--border`. Padding 16 px on phone, 20 px from md. |
| **Dialog / Sheet** | `dialog` (md and up), `sheet` (bottom on phone) | open, closing, loading content, error content | Focus is trapped and returned to the trigger. Escape or the close button dismisses it. Destructive confirmations always need a second button with the action's name. |
| **Dropdown menu / Popover** | | closed, open, focused item, disabled item | Items are at least 44 px tall. |
| **Tooltip** | | hidden, visible on hover or focus | Used for icon-only controls such as the icon rail. Never the only label. |
| **Tabs** | `line`, `segmented` | default, selected, focus, disabled | Scrolls horizontally inside its own container if needed. The page itself never scrolls sideways. |
| **Table** (`DataTable`) | | loading (skeleton rows), empty (EmptyState), error (Alert with retry), sorted | Phone: converts to a card list (`ResponsiveList`), one card per row, with the amount on the right. Money column is right-aligned. |
| **Alert** | `info`, `success`, `warning`, `destructive` | default | Icon + title + one sentence. Uses the `-subtle` token for its background. |
| **Toast** | `success`, `error`, `info` | entering, visible, leaving | Bottom on phone, above the bottom nav with 16 px spacing. Auto-dismisses after 5 s, except errors, which stay until dismissed. |
| **Skeleton** | | pulsing (disabled under reduced motion) | Same dimensions as the final content. Used for every list and card while loading. |
| **EmptyState** | `page`, `inline` | default | See `app-shell.md`, section 6. Always has one primary next action. |
| **Avatar / Initials** | | default | Initials on `--muted`. Not used as a space indicator. |
| **Progress** | | determinate, indeterminate | Used for document upload and analysis. Always has a text label with the percentage. |
| **SpaceBadge** | `personal`, `household` | default | See `app-shell.md`. |
| **MoneyText** | `neutral`, `muted`, `warning`, `destructive`; sizes `sm`, `md`, `lg` | default, negative, zero, loading | Uses `formatMoney`. `tabular-nums`. |

### 7.1 Interaction rules
- Forms validate on blur and on submit. Errors appear under the field in `--destructive` with an icon and specific text ("Enter an amount greater than 0"), never "Invalid input".
- Destructive actions (delete contract, remove member, revoke invitation) open a confirmation dialog or sheet that names the item and the consequence. The confirm button uses the `destructive` variant and the action's name ("Delete contract"), never "OK".
- Saving is optimistic only where the API has already confirmed the write. Otherwise the button shows its loading state.
- Errors from the API (RFC 7807) show the `title` and `detail` in an Alert inside the affected section. The page itself stays usable.

---

## 8. Copy and tone

- Use "you" for the signed-in user and the household name for shared data ("The Rizvi family has 4 contracts").
- Say what something does, not what it is called in the code. "Add a contract", not "Create Contract entity".
- Reassure about privacy at moments where it matters: sign-in, household invitations and the first personal record. Example: "Only you can see personal records. Household members see only what the household shares."
- Empty states invite the next step, they do not apologise.
- No exclamation marks in errors. Keep success messages short ("Contract saved").
