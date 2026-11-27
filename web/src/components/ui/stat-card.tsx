import { useId } from "react";
import type { ReactNode } from "react";
import { HemCard } from "@/components/ui/hem-card";
import { cn } from "@/lib/utils";

export interface StatCardProps {
  /** Card title, for example "Spent this month". Names the card's section. */
  title: string;
  /** The figure, normally a MoneyText with size "lg". */
  value: ReactNode;
  /** Text under the figure, for example the period or "Expenses, 1 to 27 Nov 2026". */
  hint?: ReactNode;
  className?: string;
}

/**
 * A dashboard total. It is a labelled section, so a screen reader hears the title with the figure.
 * The figure is plain text in `--foreground`; the card does not use colour to signal good or bad.
 */
export function StatCard({ title, value, hint, className }: StatCardProps) {
  const titleId = useId();
  return (
    <section aria-labelledby={titleId} className={cn("min-w-0", className)}>
      <HemCard className="h-full space-y-2">
        <h2 id={titleId} className="text-body-strong text-foreground">
          {title}
        </h2>
        <div>{value}</div>
        {hint ? <div className="text-small text-muted-foreground">{hint}</div> : null}
      </HemCard>
    </section>
  );
}
