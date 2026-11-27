/**
 * Money formatting. Amounts are decimal strings from the API and are never
 * converted to a JavaScript number. See docs/design/design-system.md section 5.
 */
export function formatMoney(
  amount: string, // decimal string from the API, e.g. "1240.50"
  currency: string, // ISO-4217, e.g. "EUR"
  locale = "en",
  opts: { code?: boolean; signDisplay?: "auto" | "always" | "exceptZero" } = {},
): string {
  // NumberFormat v3 accepts decimal strings without float loss. The cast keeps
  // older lib.d.ts typings (number | bigint) happy.
  return new Intl.NumberFormat(locale, {
    style: "currency",
    currency,
    currencyDisplay: opts.code ? "code" : "symbol",
    signDisplay: opts.signDisplay ?? "auto",
  }).format(amount as unknown as number);
}

export function formatDate(iso: string, locale = "en"): string {
  return new Intl.DateTimeFormat(locale, {
    day: "numeric",
    month: "short",
    year: "numeric",
  }).format(new Date(iso));
}

/**
 * A calendar date ("2026-12-03", no time) as "3 Dec 2026" (finance.md 3.6). Read in UTC, so no time zone can move it a day
 * (a date-only string parses as UTC midnight).
 */
export function formatCalendarDate(iso: string, locale = "en"): string {
  // Day, month, year in that order whatever the locale ("3 Dec 2026"), with the locale's short month name.
  const parts = new Intl.DateTimeFormat(locale, { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" }).formatToParts(
    new Date(iso),
  );
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? "";
  return `${get("day")} ${get("month")} ${get("year")}`;
}

/** The user's display preferences (from their profile). */
export interface FormatPrefs {
  currency: string; // ISO-4217 base currency
  locale: string; // BCP-47
}

export const DEFAULT_PREFS: FormatPrefs = { currency: "EUR", locale: "en" };

/**
 * Formatters bound to a user's base currency and locale. Falls back to the defaults for a locale
 * or currency the runtime rejects, so a bad saved value can never crash a page.
 */
export function makeFormatter(prefs: FormatPrefs) {
  const safe = (fn: (p: FormatPrefs) => string, fallback: string): string => {
    try {
      return fn(prefs);
    } catch {
      try {
        return fn(DEFAULT_PREFS);
      } catch {
        return fallback;
      }
    }
  };
  return {
    prefs,
    /** An amount in the base currency. Pass `currency` for a record held in another currency. */
    money(
      amount: string,
      opts: { currency?: string; code?: boolean; signDisplay?: "auto" | "always" | "exceptZero" } = {},
    ): string {
      return safe((p) => formatMoney(amount, opts.currency ?? p.currency, p.locale, opts), amount);
    },
    date(iso: string): string {
      return safe((p) => formatDate(iso, p.locale), iso);
    },
    /** A calendar date (no time of day), for example a contract's start date. */
    calendarDate(iso: string): string {
      return safe((p) => formatCalendarDate(iso, p.locale), iso);
    },
  };
}

export type Formatter = ReturnType<typeof makeFormatter>;
