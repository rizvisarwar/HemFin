import type { ReactNode } from "react";
import { CalendarDays, CircleAlert, Clock } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

/*
 * Due-date chip for upcoming payments, renewals and notice deadlines (finance.md 3.8).
 * The caller decides the tone from the date and passes the words ("Due in 6 days").
 * Each tone has its own icon and text, so status is never carried by colour alone.
 */

export type DueTone = "later" | "soon" | "overdue";

const TONE: Record<DueTone, { Icon: LucideIcon; classes: string }> = {
  later: { Icon: CalendarDays, classes: "bg-muted text-muted-foreground" },
  soon: { Icon: Clock, classes: "bg-warning-subtle text-warning" },
  overdue: { Icon: CircleAlert, classes: "bg-destructive-subtle text-destructive" },
};

export interface DueChipProps {
  tone: DueTone;
  /** The words, for example "Due in 6 days" or "Notice deadline soon". */
  children: ReactNode;
  className?: string;
}

export function DueChip({ tone, children, className }: DueChipProps) {
  const { Icon, classes } = TONE[tone];
  return (
    <span
      data-slot="due-chip"
      data-tone={tone}
      className={cn(
        "inline-flex min-h-6 items-center gap-1 rounded-full px-2 py-0.5 text-caption font-medium",
        classes,
        className,
      )}
    >
      <Icon aria-hidden="true" className="size-3 shrink-0" />
      {children}
    </span>
  );
}
