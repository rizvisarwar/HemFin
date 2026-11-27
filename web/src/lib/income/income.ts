/**
 * Display and form rules for income sources and entries (docs/design/finance.md section 6).
 */
import { parseAmount } from "../finance/amount.ts";
import { futureDateError, rangeError } from "../finance/common.ts";

export type SourceType = "salary" | "business" | "other";
export type SourceFrequency = "weekly" | "monthly" | "quarterly" | "semiannual" | "annual" | "irregular";

export const SOURCE_TYPE_LABEL: Record<SourceType, string> = { salary: "Salary", business: "Business", other: "Other" };

export const SOURCE_NAME_MAX = 80;

// ---- Entries: filters --------------------------------------------------------------------------

export interface EntryFilters {
  from: string;
  to: string;
  /** A source id, or "" for all sources. */
  source_id: string;
}

export const DEFAULT_ENTRY_FILTERS: EntryFilters = { from: "", to: "", source_id: "" };

export const isDefaultEntryFilters = (f: EntryFilters) => f.from === "" && f.to === "" && f.source_id === "";

/** The API query for a filter set. An invalid date range is not sent (the screen shows its message instead). */
export function entryFiltersToQuery(f: EntryFilters) {
  const range = rangeError(f.from, f.to);
  return {
    from: !range && f.from ? f.from : undefined,
    to: !range && f.to ? f.to : undefined,
    source_id: f.source_id || undefined,
  };
}

export function entryFilterButtonLabel(f: EntryFilters): string {
  const n = [f.from, f.to, f.source_id].filter((v) => v !== "").length;
  return n === 0 ? "Filters" : `Filters: ${n} applied`;
}

// ---- Entries: form -----------------------------------------------------------------------------

export interface EntryFormValues {
  amount: string;
  received_on: string;
  /** "" for no source. */
  source_id: string;
  description: string;
  /** "" is the whole household. */
  member_user_id: string;
}

export type EntryFormField = keyof EntryFormValues;
export type EntryFormErrors = Partial<Record<EntryFormField, string>>;

export interface EntryPayload {
  amount: string;
  received_on: string;
  source_id: string | null;
  description: string | null;
  member_user_id: string | null;
}

export interface ValidateOptions {
  today: string;
}

/** Checks the entry form the way finance.md 6.2 says. */
export function validateEntry(v: EntryFormValues, opts: ValidateOptions): { errors: EntryFormErrors; payload?: EntryPayload } {
  const errors: EntryFormErrors = {};
  const amount = parseAmount(v.amount);
  if (!amount.ok) errors.amount = amount.message;
  if (v.received_on === "") errors.received_on = "Enter the date you received it.";
  else {
    const late = futureDateError(v.received_on, opts.today);
    if (late) errors.received_on = late;
  }
  if (Object.keys(errors).length > 0 || !amount.ok) return { errors };
  return {
    errors,
    payload: {
      amount: amount.value,
      received_on: v.received_on,
      source_id: v.source_id || null,
      description: v.description.trim() || null,
      member_user_id: v.member_user_id || null,
    },
  };
}

// ---- Sources: form -----------------------------------------------------------------------------

export interface SourceFormValues {
  name: string;
  type: SourceType;
  amount: string;
  frequency: SourceFrequency;
  /** "" is the whole household. */
  member_user_id: string;
  active: boolean;
}

export type SourceFormField = keyof SourceFormValues;
export type SourceFormErrors = Partial<Record<SourceFormField, string>>;

export interface SourcePayload {
  name: string;
  type: SourceType;
  amount: string;
  frequency: SourceFrequency;
  member_user_id: string | null;
  active: boolean;
}

/** Checks the source form the way finance.md 6.3 says. */
export function validateSource(
  v: SourceFormValues,
): { errors: SourceFormErrors; payload?: SourcePayload } {
  const errors: SourceFormErrors = {};
  if (v.name.trim() === "") errors.name = "Enter a name for the source.";
  const amount = parseAmount(v.amount);
  if (!amount.ok) errors.amount = amount.message;
  if (Object.keys(errors).length > 0 || !amount.ok) return { errors };
  return {
    errors,
    payload: {
      name: v.name.trim(),
      type: v.type,
      amount: amount.value,
      frequency: v.frequency,
      member_user_id: v.member_user_id || null,
      active: v.active,
    },
  };
}

/** An option in the entry form's source picker: "Salary (paused)" for a source that is turned off (finance.md 6.2). */
export function sourceOptionLabel(s: { name: string; active: boolean }): string {
  return s.active ? s.name : `${s.name} (paused)`;
}
