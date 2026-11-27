/**
 * Money and date formatting. The POC is Sweden only (HEM-024): amounts are SEK and numbers and
 * dates use Swedish conventions (sv-SE), for example "1 234,50 kr" and "1 jan. 2027". UI text stays
 * English. Amounts are decimal strings from the API and are never converted to a JavaScript number.
 * See docs/design/design-system.md section 5.
 *
 * Intl uses no-break spaces in these formats, so an amount never wraps in the middle; amounts also
 * carry `whitespace-nowrap` where they are shown.
 */
export const LOCALE = "sv-SE";
export const CURRENCY = "SEK";

export function formatMoney(
  amount: string, // decimal string from the API, e.g. "1240.50"
  currency = CURRENCY, // ISO-4217. A row stored in another currency keeps showing its own code.
  opts: { signDisplay?: "auto" | "always" | "exceptZero" } = {},
): string {
  // NumberFormat v3 accepts decimal strings without float loss. The cast keeps
  // older lib.d.ts typings (number | bigint) happy.
  return new Intl.NumberFormat(LOCALE, {
    style: "currency",
    currency,
    // SEK as "kr"; any other code as its ISO code, so it cannot be mistaken for SEK.
    currencyDisplay: currency === CURRENCY ? "symbol" : "code",
    signDisplay: opts.signDisplay ?? "auto",
  }).format(amount as unknown as number);
}

/** A date and time (a timestamp) as a date, for example "26 nov. 2026". */
export function formatDate(iso: string): string {
  return new Intl.DateTimeFormat(LOCALE, { day: "numeric", month: "short", year: "numeric" }).format(new Date(iso));
}

/**
 * A calendar date ("2026-12-03", no time) as "3 dec. 2026" (finance.md 3.6). Read in UTC, so no time zone can move it a day
 * (a date-only string parses as UTC midnight).
 */
export function formatCalendarDate(iso: string): string {
  return new Intl.DateTimeFormat(LOCALE, { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" }).format(new Date(iso));
}

/** Formatters (the same for everyone: sv-SE, SEK). A failure never crashes a page; the raw value is shown. */
export function makeFormatter() {
  const safe = (fn: () => string, fallback: string): string => {
    try {
      return fn();
    } catch {
      return fallback;
    }
  };
  return {
    /** An amount in SEK. Pass `currency` for a record stored in another currency. */
    money(amount: string, opts: { currency?: string; signDisplay?: "auto" | "always" | "exceptZero" } = {}): string {
      return safe(() => formatMoney(amount, opts.currency, opts), amount);
    },
    date(iso: string): string {
      return safe(() => formatDate(iso), iso);
    },
    /** A calendar date (no time of day), for example a contract's start date. */
    calendarDate(iso: string): string {
      return safe(() => formatCalendarDate(iso), iso);
    },
  };
}

export type Formatter = ReturnType<typeof makeFormatter>;
