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
  primaryAction?: EmptyStateAction; // optional only for inline states inside a card whose page already has the action
  secondaryAction?: { label: string; href: string };
  space?: SpaceType | "active"; // "active" follows the shell's active space via CSS. Tints the icon circle with the space accent
  variant?: "page" | "inline"; // default "page"
  titleAs?: "h2" | "h3"; // heading level of the title, default "h2". Use "h3" inside a section that has its own h2
}

export function EmptyState({
  icon: Icon,
  title,
  description,
  primaryAction,
  secondaryAction,
  space,
  variant = "page",
  titleAs: Title = "h2",
}: EmptyStateProps) {
  const inline = variant === "inline";
  const circle =
    space === "personal"
      ? "bg-personal-subtle text-personal"
      : space === "household"
        ? "bg-household-subtle text-household"
        : space === "active"
          ? "bg-personal-subtle text-personal in-data-[space=household]:bg-household-subtle in-data-[space=household]:text-household"
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
        <Title className={cn("text-h3", inline && "text-body-strong")}>{title}</Title>
        <p className={cn("mt-2 text-body text-muted-foreground", inline && "text-small")}>
          {description}
        </p>
        <div className={cn(
            primaryAction || secondaryAction ? "mt-6 flex w-full flex-col" : "hidden",
            inline ? "items-start" : "items-center md:flex-row md:justify-center md:gap-4",
          )}>
          {!primaryAction ? null : primaryAction.href !== undefined ? (
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
              className="mt-2 inline-flex min-h-11 items-center text-small font-medium text-primary underline underline-offset-4 md:mt-0"
            >
              {secondaryAction.label}
            </Link>
          ) : null}
        </div>
      </div>
    </div>
  );
}
