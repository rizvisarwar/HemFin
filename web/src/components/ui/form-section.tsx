import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

export interface FormSectionProps {
  /** Legend of the group, for example "Cost" or "Renewal". Sentence case. */
  title: string;
  description?: string;
  children: ReactNode;
  className?: string;
}

/**
 * Groups the fields of a long form (contracts, income sources). A fieldset with a legend, so the
 * group name is read before each field inside it. Used inside a sheet or a dialog.
 */
export function FormSection({ title, description, children, className }: FormSectionProps) {
  return (
    <fieldset className={cn("min-w-0 space-y-4 border-0 p-0", className)}>
      <legend className="mb-1 text-h3 text-foreground">{title}</legend>
      {description ? <p className="-mt-2 text-small text-muted-foreground">{description}</p> : null}
      {children}
    </fieldset>
  );
}
