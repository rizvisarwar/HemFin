import { Lock, Users } from "lucide-react";
import { cn } from "@/lib/utils";
import type { SpaceType } from "@/components/layout/types";

export interface SpaceBadgeProps {
  type: SpaceType;
  label: string; // "Personal" or the household name
  size?: "sm" | "md"; // 24 px or 28 px tall
  className?: string;
  /** Let a long name wrap (up to two lines) instead of truncating it on one line. */
  wrap?: boolean;
}

/** Space label: always icon plus text, never colour alone. */
export function SpaceBadge({ type, label, size = "md", className, wrap }: SpaceBadgeProps) {
  const Icon = type === "personal" ? Lock : Users;
  return (
    <span
      data-space={type}
      title={label}
      className={cn(
        "inline-flex max-w-full items-center gap-1 rounded-full px-2.5 font-medium",
        type === "personal"
          ? "bg-personal-subtle text-personal"
          : "bg-household-subtle text-household",
        size === "sm" ? "h-6 text-caption" : "h-7 text-small",
        wrap && "h-auto min-h-7 py-1",
        className,
      )}
    >
      <Icon aria-hidden="true" className={size === "sm" ? "size-3 shrink-0" : "size-4 shrink-0"} />
      <span className={wrap ? "line-clamp-2 break-words" : "truncate"}>{label}</span>
    </span>
  );
}
