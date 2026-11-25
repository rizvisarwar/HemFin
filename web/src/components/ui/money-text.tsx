import { cn } from "@/lib/utils";
import { formatMoney } from "@/lib/format";

export interface MoneyTextProps {
  amount: string; // decimal string from the API, never a float
  currency: string; // ISO-4217, for example "EUR"
  locale?: string; // from profile, default "en"
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
  locale = "en",
  size = "md",
  tone = "default",
  showCode,
  signDisplay,
  caption,
  className,
}: MoneyTextProps) {
  return (
    <span className={cn("inline-flex flex-col", className)}>
      <span className={cn(SIZE[size], TONE[tone])}>
        {formatMoney(amount, currency, locale, { code: showCode, signDisplay })}
      </span>
      {caption ? <span className="text-small text-muted-foreground">{caption}</span> : null}
    </span>
  );
}
