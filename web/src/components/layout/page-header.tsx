import * as React from "react";
import Link from "next/link";
import { ChevronLeft } from "lucide-react";
import { cn } from "@/lib/utils";
import { SpaceBadge } from "@/components/ui/space-badge";
import { PageHeaderMoreActions } from "./page-header-more-actions";
import type { SpaceType } from "./types";

export interface PageHeaderProps {
  title: string; // renders as h1
  description?: string; // max two lines
  space?: SpaceType; // renders a SpaceBadge when set
  spaceName?: string; // household name for the badge
  backLink?: { label: string; href: string }; // phone back link
  breadcrumbs?: { label: string; href?: string }[]; // md and up only
  primaryAction?: React.ReactNode; // full width on phone
  secondaryActions?: React.ReactNode; // collapsed into a "..." menu on phone
  stackBadge?: boolean; // keep the badge under the title at every width (household pages, households.md D3)
}

export function PageHeader({
  title,
  description,
  space,
  spaceName,
  backLink,
  breadcrumbs,
  primaryAction,
  secondaryActions,
  stackBadge,
}: PageHeaderProps) {
  const badge = space ? (
    <SpaceBadge type={space} label={spaceName ?? (space === "personal" ? "Personal" : "Household")} />
  ) : null;

  return (
    <header className="mb-4 md:mb-6" data-slot="page-header">
      {backLink ? (
        <Link
          href={backLink.href}
          className="mb-1 inline-flex min-h-11 items-center gap-1 text-small font-medium text-primary md:hidden"
        >
          <ChevronLeft aria-hidden="true" className="size-4" />
          {backLink.label}
        </Link>
      ) : null}
      {breadcrumbs?.length ? (
        <nav aria-label="Breadcrumb" className="mb-1 hidden text-small text-muted-foreground md:block">
          <ol className="flex flex-wrap items-center gap-1">
            {breadcrumbs.map((crumb, i) => (
              <li key={`${crumb.label}-${i}`} className="flex items-center gap-1">
                {i > 0 ? <span aria-hidden="true">/</span> : null}
                {crumb.href ? (
                  <Link href={crumb.href} className="underline-offset-4 hover:underline">
                    {crumb.label}
                  </Link>
                ) : (
                  <span aria-current="page">{crumb.label}</span>
                )}
              </li>
            ))}
          </ol>
        </nav>
      ) : null}

      <div className="md:flex md:items-start md:justify-between md:gap-4">
        <div className="min-w-0">
          {/* Wraps from md up, so a long household name and its badge sit on two lines instead of squeezing the title. */}
          <div className={cn("flex flex-col items-start gap-2", !stackBadge && "md:flex-row md:flex-wrap md:items-center md:gap-x-3 md:gap-y-2")}>
            <h1 className="max-w-full min-w-0 break-words text-h1">{title}</h1>
            {badge}
          </div>
          {description ? (
            <p className="mt-2 line-clamp-2 max-w-prose text-lead text-muted-foreground">
              {description}
            </p>
          ) : null}
        </div>

        {primaryAction || secondaryActions ? (
          <div className="mt-4 flex items-center gap-2 md:mt-0 md:shrink-0">
            {primaryAction ? <div className="flex-1 md:flex-none [&>*]:w-full md:[&>*]:w-auto">{primaryAction}</div> : null}
            {secondaryActions ? (
              <>
                <div className="hidden items-center gap-2 md:flex">{secondaryActions}</div>
                <PageHeaderMoreActions>{secondaryActions}</PageHeaderMoreActions>
              </>
            ) : null}
          </div>
        ) : null}
      </div>
    </header>
  );
}
