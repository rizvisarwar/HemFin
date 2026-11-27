/**
 * Display and form rules for contracts (docs/design/finance.md section 4). The schedule itself is
 * computed by the API; nothing here works out a payment or renewal date.
 */
import { parseAmount } from "../finance/amount.ts";
import { appliesToQuery, daysBetween } from "../finance/common.ts";

/** A payment or renewal this close shows a warning chip, a notice deadline within `NOTICE_SOON_DAYS` (finance.md F6). */
export const PAYMENT_SOON_DAYS = 7;
export const NOTICE_SOON_DAYS = 30;

export type Frequency = "weekly" | "monthly" | "quarterly" | "semiannual" | "annual";

// ---- Due chips ---------------------------------------------------------------------------------

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
    member_user_id: appliesToQuery(f.applies),
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

// ---- Form --------------------------------------------------------------------------------------

export interface ContractFormValues {
  name: string;
  provider: string;
  category_id: string;
  /** The amount as typed, parsed on submit. */
  amount: string;
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

/** Checks the form the way finance.md 4.3 says. Returns the errors, and the API body when there are none. */
export function validateContract(v: ContractFormValues): { errors: ContractFormErrors; payload?: ContractPayload } {
  const errors: ContractFormErrors = {};
  if (v.name.trim() === "") errors.name = "Enter a name for the contract.";
  if (v.category_id === "") errors.category_id = "Choose a category.";
  const amount = parseAmount(v.amount);
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
