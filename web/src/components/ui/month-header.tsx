import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

export interface MonthHeaderProps {
  /** The month, already formatted, for example "November 2026". */
  title: string;
  /** Right-aligned summary, for example "EUR 812.40" or a hint about amounts left out. */
  summary?: ReactNode;
  className?: string;
}

/**
 * Group heading for a month in the expenses and income lists. It is a real h2 so screen reader
 * users can jump between months. The summary is right-aligned on every width.
 */
export function MonthHeader({ title, summary, className }: MonthHeaderProps) {
  return (
    <div className={cn("flex items-baseline justify-between gap-3 border-b border-border pb-2 pt-4", className)}>
      <h2 className="text-h3 text-foreground">{title}</h2>
      {summary ? <div className="text-right text-small text-muted-foreground">{summary}</div> : null}
    </div>
  );
}
