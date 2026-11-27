"use client";

import { cn } from "@/lib/utils";
import { useFormat } from "@/components/format-provider";

export interface MoneyTextProps {
  amount: string; // decimal string from the API, never a float
  currency?: string; // ISO-4217; SEK unless a stored row says otherwise (then its code is shown)
  size?: "sm" | "md" | "lg"; // sm 14 px, md 16 px, lg hero total
  tone?: "default" | "muted" | "warning" | "destructive";
  signDisplay?: "auto" | "always" | "exceptZero"; // "+" for income is set by the caller
  caption?: string; // text-small under the amount, for example "Income"
  className?: string;
}

// `whitespace-nowrap` and `tabular-nums`: an amount never wraps and its digits line up.
const SIZE = {
  sm: "text-small font-medium tabular-nums whitespace-nowrap",
  md: "text-money tabular-nums whitespace-nowrap",
  lg: "text-money-lg tabular-nums whitespace-nowrap",
} as const;
const TONE = {
  default: "text-foreground",
  muted: "text-muted-foreground",
  warning: "text-warning",
  destructive: "text-destructive",
} as const;

export function MoneyText({ amount, currency, size = "md", tone = "default", signDisplay, caption, className }: MoneyTextProps) {
  const { money } = useFormat();
  return (
    <span className={cn("inline-flex flex-col", className)}>
      <span className={cn(SIZE[size], TONE[tone])}>{money(amount, { currency, signDisplay })}</span>
      {caption ? <span className="text-small text-muted-foreground">{caption}</span> : null}
    </span>
  );
}
