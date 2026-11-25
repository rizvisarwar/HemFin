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
