import Link from "next/link";
import type { LucideIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { SpaceType } from "@/components/layout/types";

type EmptyStateAction =
  | { label: string; href: string; onClick?: never }
  | { label: string; onClick: () => void; href?: never };

export interface EmptyStateProps {
  icon: LucideIcon;
  title: string; // at most 4 words
  description: string; // one or two sentences
  primaryAction: EmptyStateAction;
  secondaryAction?: { label: string; href: string };
  space?: SpaceType; // tints the icon circle with the space accent
  variant?: "page" | "inline"; // default "page"
}

export function EmptyState({
  icon: Icon,
  title,
  description,
  primaryAction,
  secondaryAction,
  space,
  variant = "page",
}: EmptyStateProps) {
  const inline = variant === "inline";
  const circle =
    space === "personal"
      ? "bg-personal-subtle text-personal"
      : space === "household"
        ? "bg-household-subtle text-household"
        : "bg-muted text-muted-foreground";

  return (
    <div
      data-slot="empty-state"
      className={cn(
        "flex",
        inline ? "items-start gap-4 text-left" : "flex-col items-center px-4 pt-12 text-center",
      )}
    >
      <div
        className={cn(
          "flex shrink-0 items-center justify-center rounded-full",
          circle,
          inline ? "size-10" : "size-14",
        )}
      >
        <Icon aria-hidden="true" className={inline ? "size-5" : "size-8"} />
      </div>
      <div className={cn(inline ? "min-w-0 flex-1" : "mt-4 flex max-w-md flex-col items-center")}>
        <h2 className={cn("text-h3", inline && "text-body-strong")}>{title}</h2>
        <p className={cn("mt-2 text-body text-muted-foreground", inline && "text-small")}>
          {description}
        </p>
        <div className={cn("mt-6 flex w-full flex-col", inline ? "items-start" : "items-center")}>
          {primaryAction.href !== undefined ? (
            <Button
              nativeButton={false}
              render={<Link href={primaryAction.href} />}
              className={inline ? undefined : "w-full sm:w-auto"}
            >
              {primaryAction.label}
            </Button>
          ) : (
            <Button onClick={primaryAction.onClick} className={inline ? undefined : "w-full sm:w-auto"}>
              {primaryAction.label}
            </Button>
          )}
          {secondaryAction ? (
            <Link
              href={secondaryAction.href}
              className="mt-2 inline-flex min-h-11 items-center text-small font-medium text-primary underline-offset-4 hover:underline"
            >
              {secondaryAction.label}
            </Link>
          ) : null}
        </div>
      </div>
    </div>
  );
}
