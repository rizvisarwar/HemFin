/**
 * Rules shared by the finance screens (contracts, expenses, income): calendar dates, the category
 * picker groups, the "Applies to" filter values and the month grouping of lists
 * (docs/design/finance.md sections 3, 4.1, 5 and 6). Pure functions, no browser APIs.
 */

// ---- Dates -------------------------------------------------------------------------------------

/** Today as a calendar date in the browser's time zone ("2026-12-03"). */
export function todayIso(now: Date = new Date()): string {
  const p = (n: number) => String(n).padStart(2, "0");
  return `${now.getFullYear()}-${p(now.getMonth() + 1)}-${p(now.getDate())}`;
}

/** Whole days from `from` to `to` (both "YYYY-MM-DD"). Negative when `to` is earlier. */
export function daysBetween(from: string, to: string): number {
  const ms = (iso: string) => {
    const [y, m, d] = iso.split("-").map(Number);
    return Date.UTC(y, m - 1, d);
  };
  return Math.round((ms(to) - ms(from)) / 86_400_000);
}

export const FUTURE_DATE_MESSAGE = "The date cannot be more than a day in the future.";

/** A record date may be at most one day ahead (finance.md 3.6, Q10). Returns the message, or undefined when fine. */
export function futureDateError(date: string, today: string): string | undefined {
  return date !== "" && daysBetween(today, date) > 1 ? FUTURE_DATE_MESSAGE : undefined;
}

/** The From date must not be after the To date (finance.md 3.6). Either may be empty. */
export function rangeError(from: string, to: string): string | undefined {
  return from !== "" && to !== "" && from > to ? "The From date must be before the To date." : undefined;
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export const isUuid = (value: string | null | undefined): value is string => !!value && UUID.test(value);

// ---- "Applies to" filter -----------------------------------------------------------------------

/**
 * A list filter's own values (finance.md 4.1): `all` (no filter), `household` (the whole household) or a
 * member's user id. Not the same as the form's `""`, which means the whole household. The API takes
 * `member_user_id=none` for the whole household.
 */
export function appliesToQuery(applies: string): string | undefined {
  return applies === "all" ? undefined : applies === "household" ? "none" : applies;
}

// ---- Categories --------------------------------------------------------------------------------

export interface CategoryLike {
  id: string;
  key: string;
  name: string;
  parent_key: string | null;
  kind: string;
  system: boolean;
}

export interface CategoryGroupOut {
  label: string;
  options: { value: string; label: string }[];
}

/** Order of the system groups (finance.md 3.4). Groups the API adds later follow, then "Your categories". */
const GROUP_ORDER = ["insurance", "utility", "subscription", "membership", "housing", "transport", "food", "health", "kids", "other"];

/**
 * Expense categories as picker groups: one per parent, in the spec's order, then "Your categories".
 * A parent with no children is its own single option. `by` chooses the option value: the category id
 * (forms) or its key (the list filter, where a group also gets an "All ..." option for the parent key).
 */
export function categoryGroups(categories: CategoryLike[], by: "id" | "key"): CategoryGroupOut[] {
  const expense = categories.filter((c) => c.kind === "expense");
  const parents = expense.filter((c) => c.system && c.parent_key === null);
  parents.sort((a, b) => rank(a.key) - rank(b.key) || a.name.localeCompare(b.name));
  const groups: CategoryGroupOut[] = [];
  for (const parent of parents) {
    const kids = expense.filter((c) => c.system && c.parent_key === parent.key);
    const value = (c: CategoryLike) => (by === "id" ? c.id : c.key);
    if (kids.length === 0) {
      groups.push({ label: parent.name, options: [{ value: value(parent), label: parent.name }] });
      continue;
    }
    const options = kids.map((k) => ({ value: value(k), label: k.name }));
    if (by === "key") options.unshift({ value: parent.key, label: `All ${parent.name.toLowerCase()}` });
    groups.push({ label: parent.name, options });
  }
  const custom = expense.filter((c) => !c.system);
  if (custom.length > 0) {
    groups.push({
      label: "Your categories",
      options: custom.map((c) => ({ value: by === "id" ? c.id : c.key, label: c.name })),
    });
  }
  return groups;
}

function rank(key: string): number {
  const i = GROUP_ORDER.indexOf(key);
  return i === -1 ? GROUP_ORDER.length : i;
}

// ---- Month groups ------------------------------------------------------------------------------

export interface MonthGroup<T> {
  /** "2026-11". */
  key: string;
  items: T[];
}

/**
 * Groups a newest-first list by calendar month, using the date string itself (no time zone, F10).
 * A month that continues on a later page stays one group, because the items arrive in order.
 */
export function groupByMonth<T>(items: T[], dateOf: (item: T) => string): MonthGroup<T>[] {
  const groups: MonthGroup<T>[] = [];
  for (const item of items) {
    const key = dateOf(item).slice(0, 7);
    const last = groups[groups.length - 1];
    if (last && last.key === key) last.items.push(item);
    else groups.push({ key, items: [item] });
  }
  return groups;
}

/** "November 2026" for a "2026-11" key, read in UTC so no time zone moves it. */
export function monthTitle(key: string, locale = "en"): string {
  try {
    return new Intl.DateTimeFormat(locale, { month: "long", year: "numeric", timeZone: "UTC" }).format(new Date(`${key}-01T00:00:00Z`));
  } catch {
    return key;
  }
}
