import { CircleHelp } from "lucide-react";
import { makeFormatter } from "@/lib/format";
import { cn } from "@/lib/utils";

export interface ConvertedAmountProps {
  /** The record's own currency. Same as `baseCurrency` renders nothing. */
  originalCurrency: string;
  /** The space's base currency (the profile's base currency), for example "EUR". */
  baseCurrency: string;
  locale?: string; // defaults to "en"
  /** The day the rate applies to, already formatted, for example "3 Dec 2026". */
  dateLabel: string;
  /** The amount in the base currency, as a decimal string from the API. Null means no rate. */
  converted: { amount: string } | null;
  className?: string;
}

/**
 * The base-currency equivalent, shown under the original amount: "About SEK 1,234.00" in the
 * base currency. When no rate exists it says so, in neutral text with an icon (never an alarm
 * colour), and it does not guess. Presentational only: the caller passes the converted amount.
 */
export function ConvertedAmount({
  originalCurrency,
  baseCurrency,
  locale = "en",
  dateLabel,
  converted,
  className,
}: ConvertedAmountProps) {
  if (originalCurrency === baseCurrency) return null;

  if (!converted) {
    return (
      <p className={cn("flex items-start justify-end gap-1.5 text-small text-muted-foreground", className)}>
        <CircleHelp aria-hidden="true" className="mt-0.5 size-4 shrink-0" />
        <span>
          No {originalCurrency} to {baseCurrency} rate for {dateLabel}. Not in the {baseCurrency} total.
        </span>
      </p>
    );
  }

  const formatter = makeFormatter({ currency: baseCurrency, locale });
  const money = formatter.money(converted.amount, { currency: baseCurrency, code: true });
  return (
    <p className={cn("text-right text-small text-muted-foreground tabular-nums", className)}>
      <span aria-hidden="true">≈ </span>
      <span className="sr-only">About </span>
      {money}
    </p>
  );
}
