/**
 * Display and form rules for contracts (docs/design/finance.md section 4). The schedule itself is
 * computed by the API; nothing here works out a payment or renewal date.
 */
import { parseAmount, type DecimalMark } from "./amount.ts";
import { parseProblem, type ProblemFields } from "../profile/problem.ts";

/** A payment or renewal this close shows a warning chip, a notice deadline within `NOTICE_SOON_DAYS` (finance.md F6). */
export const PAYMENT_SOON_DAYS = 7;
export const NOTICE_SOON_DAYS = 30;

export type Frequency = "weekly" | "monthly" | "quarterly" | "semiannual" | "annual";

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

function inDays(n: number): string {
  return n === 0 ? "today" : n === 1 ? "tomorrow" : `in ${n} days`;
}

export interface Chip {
  key: "payment" | "renewal" | "notice";
  text: string;
}

/** "Due in 6 days", "Due tomorrow", "Due today" when the next payment is within 7 days; otherwise null. */
export function paymentChip(nextPayment: string | null, today: string): Chip | null {
  if (!nextPayment) return null;
  const n = daysBetween(today, nextPayment);
  if (n < 0 || n > PAYMENT_SOON_DAYS) return null;
  return { key: "payment", text: n === 0 ? "Due today" : n === 1 ? "Due tomorrow" : `Due in ${n} days` };
}

/** "Renews in 6 days" when the renewal is within 7 days; otherwise null. */
export function renewalChip(renewal: string | null, today: string): Chip | null {
  if (!renewal) return null;
  const n = daysBetween(today, renewal);
  if (n < 0 || n > PAYMENT_SOON_DAYS) return null;
  return { key: "renewal", text: n === 0 ? "Renews today" : n === 1 ? "Renews tomorrow" : `Renews in ${n} days` };
}

/** "Notice deadline soon, in 5 days" when the deadline is 0 to 30 days away; otherwise null (a passed one is plain text). */
export function noticeChip(deadline: string | null, today: string): Chip | null {
  if (!deadline) return null;
  const n = daysBetween(today, deadline);
  if (n < 0 || n > NOTICE_SOON_DAYS) return null;
  return { key: "notice", text: `Notice deadline soon, ${inDays(n)}` };
}

/** True when the notice deadline is before today. */
export function noticePassed(deadline: string | null, today: string): boolean {
  return deadline !== null && daysBetween(today, deadline) < 0;
}

// ---- List filters ------------------------------------------------------------------------------

export type StatusFilter = "active" | "cancelled" | "all";

/** `applies` is `all` (no filter), `household` (the whole household) or a member's user id. */
export interface ContractFilters {
  status: StatusFilter;
  /** A category key (`insurance.home`), a group key (`insurance`), or "" for all. */
  category: string;
  applies: string;
}

export const DEFAULT_FILTERS: ContractFilters = { status: "active", category: "", applies: "all" };

export const STATUS_LABEL: Record<StatusFilter, string> = { active: "Active", cancelled: "Cancelled", all: "All" };

/** The API query for a filter set: `member_user_id=none` is the whole household. */
export function filtersToQuery(f: ContractFilters) {
  return {
    status: f.status === "all" ? undefined : f.status,
    category: f.category || undefined,
    member_user_id: f.applies === "all" ? undefined : f.applies === "household" ? "none" : f.applies,
  };
}

/** Filters set beyond the status (the "1 more" in "Filters: Active, 1 more"). */
export function extraFilterCount(f: ContractFilters): number {
  return (f.category ? 1 : 0) + (f.applies !== "all" ? 1 : 0);
}

export function filterButtonLabel(f: ContractFilters): string {
  const extra = extraFilterCount(f);
  return `Filters: ${STATUS_LABEL[f.status]}${extra ? `, ${extra} more` : ""}`;
}

export const isDefaultFilters = (f: ContractFilters) =>
  f.status === DEFAULT_FILTERS.status && f.category === "" && f.applies === "all";

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

// ---- Form --------------------------------------------------------------------------------------

export interface ContractFormValues {
  name: string;
  provider: string;
  category_id: string;
  /** The amount as typed, parsed on submit. */
  amount: string;
  currency: string;
  frequency: Frequency;
  start_date: string;
  end_date: string;
  auto_renew: boolean;
  /** Text, so the field can be empty or wrong while typing. */
  renewal_term_months: string;
  notice_period_days: string;
  /** "" is the whole household. */
  member_user_id: string;
  notes: string;
}

export type ContractFormField = keyof ContractFormValues;
export type ContractFormErrors = Partial<Record<ContractFormField, string>>;

/** Body for create (POST) and edit (PATCH): every editable field, nullable ones null when empty. */
export interface ContractPayload {
  category_id: string;
  name: string;
  provider: string | null;
  amount: string;
  currency: string;
  frequency: Frequency;
  start_date: string;
  end_date: string | null;
  auto_renew: boolean;
  renewal_term_months: number | null;
  notice_period_days: number | null;
  member_user_id: string | null;
  notes: string | null;
}

export const NAME_MAX = 80;
export const NOTES_MAX = 500;
const WHOLE = /^\d+$/;

export interface ValidateOptions {
  mark: DecimalMark;
  digits: number;
}

/** Checks the form the way finance.md 4.3 says. Returns the errors, and the API body when there are none. */
export function validateContract(
  v: ContractFormValues,
  opts: ValidateOptions,
): { errors: ContractFormErrors; payload?: ContractPayload } {
  const errors: ContractFormErrors = {};
  if (v.name.trim() === "") errors.name = "Enter a name for the contract.";
  if (v.category_id === "") errors.category_id = "Choose a category.";
  const amount = parseAmount(v.amount, { mark: opts.mark, digits: opts.digits, currency: v.currency });
  if (!amount.ok) errors.amount = amount.message;
  if (v.start_date === "") errors.start_date = "Enter the start date.";
  if (v.end_date !== "" && v.start_date !== "" && v.end_date < v.start_date) {
    errors.end_date = "The end date must be on or after the start date.";
  }
  let term: number | null = null;
  if (v.auto_renew) {
    const t = v.renewal_term_months.trim();
    term = WHOLE.test(t) ? Number(t) : NaN;
    if (!(term >= 1 && term <= 120)) errors.renewal_term_months = "Enter a whole number of months, from 1 to 120.";
  }
  let notice: number | null = null;
  const n = v.notice_period_days.trim();
  if (n !== "") {
    notice = WHOLE.test(n) ? Number(n) : NaN;
    if (!(notice >= 0 && notice <= 3650)) errors.notice_period_days = "Enter a whole number of days, for example 30.";
  }
  if (Object.keys(errors).length > 0 || !amount.ok) return { errors };
  return {
    errors,
    payload: {
      category_id: v.category_id,
      name: v.name.trim(),
      provider: v.provider.trim() || null,
      amount: amount.value,
      currency: v.currency,
      frequency: v.frequency,
      start_date: v.start_date,
      end_date: v.end_date || null,
      auto_renew: v.auto_renew,
      renewal_term_months: term,
      notice_period_days: notice,
      member_user_id: v.member_user_id || null,
      notes: v.notes.trim() || null,
    },
  };
}

// ---- Server errors -----------------------------------------------------------------------------

/** The API reports a foreign category or member with a code and a plain detail, not an `errors[]` entry. */
const CODE_FIELD: Record<string, ContractFormField> = {
  invalid_category: "category_id",
  invalid_member: "member_user_id",
};

/** Maps a problem+json response to field errors (by API field name, F8) and a form-level message. */
export function contractProblem(status: number, body: unknown): ProblemFields {
  const problem = parseProblem(status, body);
  const b = (typeof body === "object" && body !== null ? body : {}) as { code?: unknown; detail?: unknown };
  const field = typeof b.code === "string" ? CODE_FIELD[b.code] : undefined;
  if (field && typeof b.detail === "string" && b.detail.trim() !== "") {
    return { fields: { ...problem.fields, [field]: b.detail }, status };
  }
  return problem;
}
