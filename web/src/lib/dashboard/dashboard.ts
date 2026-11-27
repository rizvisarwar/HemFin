import type { DueTone } from "@/components/ui/due-chip";
import type { DashboardEventResponse, DashboardResponse } from "@/lib/api";

// No money arithmetic lives here: every total comes from the API. These helpers only decide
// which words and states to show.

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const MONTH_NAMES = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
];

/**
 * "2026-12-03" as "3 Dec 2026" (design-system rule 8). A calendar date has no time zone, so the
 * string is read as-is, never through `new Date(...)`. Minimal local helper: swap for the shared
 * `calendarDate` in lib/format once HEM-021 (#30) lands.
 */
export function calendarDate(iso: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  if (!m) return iso;
  const month = MONTHS[Number(m[2]) - 1];
  return month ? `${Number(m[3])} ${month} ${m[1]}` : iso;
}

/** "2026-11" as "November 2026". */
export function monthLabel(month: string): string {
  const m = /^(\d{4})-(\d{2})$/.exec(month);
  const name = m ? MONTH_NAMES[Number(m[2]) - 1] : undefined;
  return m && name ? `${name} ${m[1]}` : month;
}

/** Whole days from `today` to `iso`, both calendar dates (UTC, like the API's "today"). */
export function daysUntil(iso: string, today: string): number {
  return Math.round((Date.parse(`${iso}T00:00:00Z`) - Date.parse(`${today}T00:00:00Z`)) / 86_400_000);
}

export function utcToday(now: Date = new Date()): string {
  return now.toISOString().slice(0, 10);
}

/** True for a zero amount string such as "0.00" or "0". */
export function isZeroAmount(amount: string): boolean {
  return /^0*(\.0*)?$/.test(amount);
}

/**
 * First run: nothing to show yet. The API has no "has records" flag, so this is read from the
 * response: every total is zero, nothing is upcoming and nothing was skipped.
 */
export function isFirstRun(d: DashboardResponse): boolean {
  return (
    isZeroAmount(d.spent_this_month.amount) &&
    isZeroAmount(d.recurring_monthly.amount) &&
    isZeroAmount(d.income_this_month.amount) &&
    d.upcoming.length === 0 &&
    d.unconverted_count === 0
  );
}

export function unconvertedHint(count: number, base: string): string {
  return count === 1
    ? `1 amount is not in ${base}, because no rate was found for its date. Totals leave it out.`
    : `${count} amounts are not in ${base}, because no rate was found for their dates. Totals leave them out.`;
}

export const EVENT_LABEL: Record<DashboardEventResponse["type"], string> = {
  payment: "Payment",
  renewal: "Renewal",
  notice_deadline: "Notice deadline",
};

// Thresholds in one place (finance.md 3.8, Q3).
const SOON_DAYS = 7;
const NOTICE_SOON_DAYS = 30;

function inDays(days: number): string {
  return days === 0 ? "today" : days === 1 ? "tomorrow" : `in ${days} days`;
}

/** The due chip for an event, or null when only the date is shown. */
export function dueChip(type: DashboardEventResponse["type"], days: number): { tone: DueTone; text: string } | null {
  if (days < 0) return null;
  if (type === "payment" && days <= SOON_DAYS) {
    return { tone: "soon", text: days === 0 ? "Due today" : days === 1 ? "Due tomorrow" : `Due in ${days} days` };
  }
  if (type === "renewal" && days <= SOON_DAYS) {
    return { tone: "soon", text: days === 0 ? "Renews today" : days === 1 ? "Renews tomorrow" : `Renews in ${days} days` };
  }
  if (type === "notice_deadline" && days <= NOTICE_SOON_DAYS) {
    return { tone: "soon", text: `Notice deadline soon, ${inDays(days)}` };
  }
  return null;
}
