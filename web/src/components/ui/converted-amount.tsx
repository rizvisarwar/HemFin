import { makeFormatter } from "@/lib/format";
import { cn } from "@/lib/utils";

export interface ConvertedAmountProps {
  /** The record's own currency. Same as `baseCurrency` renders nothing. */
  originalCurrency: string;
  /** The space's base currency (the profile's base currency), for example "EUR". */
  baseCurrency: string;
  locale?: string; // defaults to "en"
  /** The amount in the base currency, as a decimal string from the API. Null means no rate: renders nothing (finance.md 3.3). */
  converted: { amount: string } | null;
  className?: string;
}

/**
 * The base-currency equivalent, shown under the original amount: "About EUR 48.11" in the base
 * currency. Renders nothing when the currencies match or when there is no rate (`converted` is
 * null). A missing rate is reported only by the dashboard hint (finance.md 3.3, Q13). Presentational
 * only: the caller passes the converted amount.
 */
export function ConvertedAmount({ originalCurrency, baseCurrency, locale = "en", converted, className }: ConvertedAmountProps) {
  if (originalCurrency === baseCurrency || !converted) return null;

  const formatter = makeFormatter({ currency: baseCurrency, locale });
  const money = formatter.money(converted.amount, { currency: baseCurrency, code: true });
  return (
    <span className={cn("block text-right text-small text-muted-foreground tabular-nums", className)}>
      <span aria-hidden="true">≈ </span>
      <span className="sr-only">About </span>
      {money}
    </span>
  );
}
