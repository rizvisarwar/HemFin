import * as React from "react";
import { cn } from "@/lib/utils";
import type { SpaceType } from "@/components/layout/types";

export interface HemCardProps extends React.HTMLAttributes<HTMLDivElement> {
  variant?: "default" | "interactive" | "muted"; // interactive: hover border, link-like
  space?: SpaceType; // optional 2 px accent on the left edge
  padding?: "default" | "none"; // default 16 px phone, 20 px md+
}

export function HemCard({
  variant = "default",
  space,
  padding = "default",
  className,
  ...props
}: HemCardProps) {
  return (
    <div
      data-slot="hem-card"
      className={cn(
        "rounded-lg border border-border text-card-foreground",
        variant === "muted" ? "bg-muted" : "bg-card",
        variant === "interactive" &&
          "transition-colors duration-150 ease-out hover:border-accent-foreground/40 focus-within:border-accent-foreground/40",
        space === "personal" && "border-l-2 border-l-personal",
        space === "household" && "border-l-2 border-l-household",
        padding === "default" && "p-4 md:p-5",
        className,
      )}
      {...props}
    />
  );
}
