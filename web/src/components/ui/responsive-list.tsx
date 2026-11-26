import * as React from "react";
import { HemCard } from "@/components/ui/hem-card";
import { cn } from "@/lib/utils";

export interface ResponsiveListProps<T> {
  rows: T[];
  getRowKey: (row: T) => string;
  /** Renders the inside of one row's card. */
  renderCard: (row: T) => React.ReactNode;
  /** Names the list for screen readers. */
  label: string;
  cardTestId?: string;
  className?: string;
}

/**
 * The phone counterpart of `DataTable` (docs/design/design-system.md section 7, Table): one card per
 * row, shown below `md`. A screen renders both with the same rows, so a table becomes a card list on
 * phones. Presentational only.
 */
export function ResponsiveList<T>({ rows, getRowKey, renderCard, label, cardTestId, className }: ResponsiveListProps<T>) {
  return (
    <ul className={cn("space-y-3 md:hidden", className)} aria-label={label}>
      {rows.map((row) => (
        <li key={getRowKey(row)}>
          <HemCard data-testid={cardTestId}>{renderCard(row)}</HemCard>
        </li>
      ))}
    </ul>
  );
}
