# HEM-002: Design system and responsive app shell

**Phase:** 0 · **Status:** Todo · **Owner:** Designer · **Depends on:** -

## Goal
Define the HemFin visual language and the responsive app shell that every later screen uses.

## Acceptance criteria
- [ ] `docs/design/design-system.md`: brand feel, color tokens (light+dark, AA contrast verified with ratios), type scale, spacing, radius, shadows, money formatting rules, icon set (lucide), component inventory with states.
- [ ] `docs/design/app-shell.md`: phone/tablet/desktop wireframes (ASCII) for: top bar with space switcher (Personal / household badge), bottom nav (phone: Dashboard, Contracts, Reports, Notifications, More), sidebar (md+), page header pattern, empty-state pattern, sign-in page layout, landing page.
- [ ] Nav items for the full product listed (Dashboard, Contracts, Expenses, Income, Reports, Documents, Suggestions, Assistant, Household, Profile) with which appear in bottom nav vs. "More".
- [ ] Hand-off section listing the components HEM-003 must build (AppShell, BottomNav, SideNav, TopBar, SpaceSwitcher, PageHeader, EmptyState, Card, MoneyText) with props.
- [ ] Docs only in this ticket (web/ does not exist yet); commit on branch `hem-002-design-system-shell` and open a PR.

## Design notes

## Handoff log

### 2026-11-25 · Designer
- **Done:** wrote `docs/design/design-system.md` (tokens as HSL shadcn variables for light and dark, contrast table, type scale, spacing, radius, elevation, focus, motion, money formatting rules, lucide icon map, component inventory with states) and `docs/design/app-shell.md` (breakpoints, shell wireframes at 375/768/1280, navigation table with bottom-nav/More split, space switcher and SpaceBadge, page header, empty-state, sign-in and landing wireframes at all three widths, responsive checklist, TypeScript props for HEM-003 in section 10).
- **Contrast:** every text and key non-text pair is at least 4.5:1 (text) or 3:1 (UI) in both themes. Ratios are in the design-system doc, section 2.3.
- **Decisions to confirm (app-shell.md, section 11):** bottom-nav label "Alerts" for Notifications so it fits a 375 px slot (full name used everywhere else); Notifications added to the nav as an extra item; sidebar expands at 1280 px, with an icon rail from 768 px.
- **Left for HEM-003:** no code in this ticket. HEM-003 builds the tokens into `web/` and the components in section 10. It uses Tailwind CSS v4 with current shadcn/ui (see PM decisions below).
- **Verify:** read both docs. Check that the wireframes render monospaced without wrapping, and that the token values in design-system.md section 2.2 match the table in 2.1.
- **PM decisions (2026-11-25):**
  1. Keep "Alerts" as the phone bottom-nav label.
  2. Keep Notifications in the nav.
  3. Use Tailwind CSS v4 with current shadcn/ui. The HSL values are kept, written as full `hsl()` values on `:root` and `.dark` and mapped through `@theme inline` in `globals.css`. No `tailwind.config` file.
  4. Store the active space in the `hemfin-space` cookie.
  5. Sign-in copy: "Your personal finances stay private. Household finances are shared only with the family members you invite."

## Review
