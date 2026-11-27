/**
 * Display and form rules for expenses (docs/design/finance.md section 5). Amounts stay strings; the
 * browser never adds money up (F10).
 */
import { parseAmount } from "../finance/amount.ts";
import { appliesToQuery, futureDateError, rangeError } from "../finance/common.ts";

// ---- List filters ------------------------------------------------------------------------------

/** `applies` is `all` (no filter), `household` (the whole household) or a member's user id. */
export interface ExpenseFilters {
  from: string;
  to: string;
  /** A category key (`food.groceries`), a group key (`food`), or "" for all. */
  category: string;
  applies: string;
  /** Set by the "Expenses for this contract" link; "" for none. */
  contract_id: string;
}

export const DEFAULT_FILTERS: ExpenseFilters = { from: "", to: "", category: "", applies: "all", contract_id: "" };

export const isDefaultFilters = (f: ExpenseFilters) =>
  f.from === "" && f.to === "" && f.category === "" && f.applies === "all" && f.contract_id === "";

/** The API query for a filter set. An invalid date range is not sent (the screen shows its message instead). */
export function expenseFiltersToQuery(f: ExpenseFilters) {
  const range = rangeError(f.from, f.to);
  return {
    from: !range && f.from ? f.from : undefined,
    to: !range && f.to ? f.to : undefined,
    category: f.category || undefined,
    member_user_id: appliesToQuery(f.applies),
    contract_id: f.contract_id || undefined,
  };
}

/** How many filters are set (the contract chip counts too). */
export function activeFilterCount(f: ExpenseFilters): number {
  return [f.from, f.to, f.category, f.applies !== "all" ? "x" : "", f.contract_id].filter((v) => v !== "").length;
}

export function filterButtonLabel(f: ExpenseFilters): string {
  const n = activeFilterCount(f);
  return n === 0 ? "Filters" : `Filters: ${n} applied`;
}

// ---- Form --------------------------------------------------------------------------------------

export interface ExpenseFormValues {
  /** The amount as typed, parsed on submit. */
  amount: string;
  category_id: string;
  spent_on: string;
  description: string;
  merchant: string;
  /** "" for no contract. */
  contract_id: string;
  /** "" is the whole household. */
  member_user_id: string;
}

export type ExpenseFormField = keyof ExpenseFormValues;
export type ExpenseFormErrors = Partial<Record<ExpenseFormField, string>>;

/** Body for create (POST) and edit (PATCH): every editable field, nullable ones null when empty. */
export interface ExpensePayload {
  category_id: string;
  amount: string;
  spent_on: string;
  description: string | null;
  merchant: string | null;
  contract_id: string | null;
  member_user_id: string | null;
}

export const MERCHANT_MAX = 80;

export interface ExpenseValidateOptions {
  /** Today as a calendar date, for the one-day-ahead rule. */
  today: string;
}

/** Checks the form the way finance.md 5.2 says. Returns the errors, and the API body when there are none. */
export function validateExpense(
  v: ExpenseFormValues,
  opts: ExpenseValidateOptions,
): { errors: ExpenseFormErrors; payload?: ExpensePayload } {
  const errors: ExpenseFormErrors = {};
  const amount = parseAmount(v.amount);
  if (!amount.ok) errors.amount = amount.message;
  if (v.category_id === "") errors.category_id = "Choose a category.";
  if (v.spent_on === "") errors.spent_on = "Enter the date you paid.";
  else {
    const late = futureDateError(v.spent_on, opts.today);
    if (late) errors.spent_on = late;
  }
  if (Object.keys(errors).length > 0 || !amount.ok) return { errors };
  return {
    errors,
    payload: {
      category_id: v.category_id,
      amount: amount.value,
      spent_on: v.spent_on,
      description: v.description.trim() || null,
      merchant: v.merchant.trim() || null,
      contract_id: v.contract_id || null,
      member_user_id: v.member_user_id || null,
    },
  };
}

// ---- Last used category (F19) ------------------------------------------------------------------

const LAST_CATEGORY_KEY = (spaceId: string) => `hemfin:last-category:${spaceId}`;

/** The category last used in this space in this browser, or "". A per-viewer convenience: storage may be blocked. */
export function readLastCategory(spaceId: string): string {
  try {
    return window.localStorage.getItem(LAST_CATEGORY_KEY(spaceId)) ?? "";
  } catch {
    return "";
  }
}

export function writeLastCategory(spaceId: string, categoryId: string): void {
  try {
    window.localStorage.setItem(LAST_CATEGORY_KEY(spaceId), categoryId);
  } catch {
    // Blocked storage: the form simply starts empty next time.
  }
}
