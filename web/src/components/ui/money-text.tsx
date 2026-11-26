"use client";

import { cn } from "@/lib/utils";
import { useFormat } from "@/components/format-provider";
import { makeFormatter } from "@/lib/format";

export interface MoneyTextProps {
  amount: string; // decimal string from the API, never a float
  currency?: string; // ISO-4217; defaults to the profile's base currency
  locale?: string; // defaults to the profile's locale
  size?: "sm" | "md" | "lg"; // sm 14 px, md 16 px, lg hero total
  tone?: "default" | "muted" | "warning" | "destructive";
  showCode?: boolean; // "EUR 1,240.00" instead of the symbol
  signDisplay?: "auto" | "always" | "exceptZero"; // "+" for income is set by the caller
  caption?: string; // text-small under the amount, for example "Income"
  className?: string;
}

const SIZE = { sm: "text-small font-medium tabular-nums", md: "text-money", lg: "text-money-lg" } as const;
const TONE = {
  default: "text-foreground",
  muted: "text-muted-foreground",
  warning: "text-warning",
  destructive: "text-destructive",
} as const;

export function MoneyText({
  amount,
  currency,
  locale,
  size = "md",
  tone = "default",
  showCode,
  signDisplay,
  caption,
  className,
}: MoneyTextProps) {
  // Base currency and locale come from the user's profile (FormatProvider) unless a record says otherwise.
  const { prefs } = useFormat();
  const format = makeFormatter({ currency: currency ?? prefs.currency, locale: locale ?? prefs.locale });
  return (
    <span className={cn("inline-flex flex-col", className)}>
      <span className={cn(SIZE[size], TONE[tone])}>
        {format.money(amount, { code: showCode, signDisplay })}
      </span>
      {caption ? <span className="text-small text-muted-foreground">{caption}</span> : null}
    </span>
  );
}
