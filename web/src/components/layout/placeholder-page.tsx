import type { LucideIcon } from "lucide-react";
import { EmptyState } from "@/components/ui/empty-state";
import { AppPageHeader } from "./app-page-header";

/** Placeholder content for a nav item: page header plus the page EmptyState. */
export function PlaceholderPage({
  title,
  description,
  icon,
  emptyTitle,
  emptyDescription,
  actionLabel,
  actionHref,
  secondaryLabel,
  secondaryHref,
}: {
  title: string;
  description: string;
  icon: LucideIcon;
  emptyTitle: string;
  emptyDescription: string;
  actionLabel: string;
  actionHref: string;
  secondaryLabel?: string;
  secondaryHref?: string;
}) {
  return (
    <>
      <AppPageHeader title={title} description={description} />
      <EmptyState
        icon={icon}
        title={emptyTitle}
        description={emptyDescription}
        primaryAction={{ label: actionLabel, href: actionHref }}
        secondaryAction={
          secondaryLabel && secondaryHref ? { label: secondaryLabel, href: secondaryHref } : undefined
        }
      />
    </>
  );
}
