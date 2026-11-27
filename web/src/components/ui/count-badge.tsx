import { cn } from "@/lib/utils";

export interface CountBadgeProps {
  /** The number to show. Nothing renders when it is 0 or less. */
  count: number;
  /** Largest number shown before the cap, so 10 shows as "9+". Default 9 (notifications.md section 3). */
  max?: number;
  className?: string;
}

/**
 * Unread count on the bell, the icon rail and the sidebar (docs/design/notifications.md, section 3).
 * Presentational only. It is decorative (`aria-hidden`): the control it sits in carries the full count in
 * its accessible name, for example "Notifications, 12 unread". Uses the primary tokens, not red, because an
 * unread count is not an error (design-system.md, section 1).
 */
export function CountBadge({ count, max = 9, className }: CountBadgeProps) {
  if (count <= 0) return null;
  return (
    <span
      data-slot="count-badge"
      aria-hidden="true"
      className={cn(
        "inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-primary px-1.5 text-caption font-medium tabular-nums text-primary-foreground",
        className,
      )}
    >
      {count > max ? `${max}+` : count}
    </span>
  );
}
