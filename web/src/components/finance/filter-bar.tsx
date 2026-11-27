"use client";

import * as React from "react";
import { ListFilter } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ResponsiveDialog } from "@/components/ui/responsive-dialog";
import { cn } from "@/lib/utils";
import { useHydrated } from "@/lib/hooks/use-hydrated";

export interface FilterBarProps<F> {
  /** The filters the list currently shows. */
  filters: F;
  /** What "Clear filters" goes back to. */
  defaults: F;
  /** Applies a filter set: the list reloads. */
  onApply: (next: F) => void;
  /** Label of the phone button, for example "Filters: 2 applied". */
  buttonLabel: string;
  /** Primary button of the phone sheet, for example "Show expenses". */
  showLabel: string;
  /** False for a set that must not be applied (for example From after To). The controls show why. */
  isValid?: (next: F) => boolean;
  /** Grid columns of the desktop row, for example "md:grid-cols-4". */
  rowClassName?: string;
  /** The controls. `prefix` keeps ids apart between the row and the sheet (both can be in the DOM). */
  children: (control: { prefix: string; value: F; onChange: (next: F) => void }) => React.ReactNode;
}

/**
 * The filter pattern of the finance lists (finance.md 4.1): from `md` the controls sit in a row and
 * apply at once; on a phone one button opens a sheet with the controls and "Show ..." / "Clear
 * filters". A set that is not valid (a reversed date range) is kept in the controls but not applied.
 */
export function FilterBar<F>({ filters, defaults, onApply, buttonLabel, showLabel, isValid, rowClassName, children }: FilterBarProps<F>) {
  const hydrated = useHydrated();
  const [open, setOpen] = React.useState(false);
  const [draft, setDraft] = React.useState<F>(filters);
  // A row value that was not applied (invalid), kept only while the applied filters are the ones it was typed against.
  const [held, setHeld] = React.useState<{ base: F; value: F } | null>(null);
  const rowValue = held && held.base === filters ? held.value : filters;
  const valid = React.useCallback((f: F) => (isValid ? isValid(f) : true), [isValid]);

  function rowChange(next: F) {
    if (valid(next)) {
      setHeld(null);
      onApply(next);
    } else {
      setHeld({ base: filters, value: next });
    }
  }

  return (
    <>
      {/* md and up: the filters sit in a row and apply at once. */}
      <div className={cn("mb-4 hidden gap-4 md:grid", rowClassName ?? "md:grid-cols-3")} data-testid="filter-row">
        {children({ prefix: "filter", value: rowValue, onChange: rowChange })}
      </div>
      {/* Phone: one button that opens a sheet. */}
      <Button
        type="button"
        variant="outline"
        className="mb-4 w-full justify-start md:hidden"
        disabled={!hydrated}
        data-testid="filters-button"
        onClick={() => {
          setDraft(filters);
          setOpen(true);
        }}
      >
        <ListFilter aria-hidden="true" />
        {buttonLabel}
      </Button>

      <ResponsiveDialog
        open={open}
        onOpenChange={setOpen}
        title="Filters"
        footer={
          <>
            <Button
              type="button"
              onClick={() => {
                if (!valid(draft)) return;
                onApply(draft);
                setOpen(false);
              }}
            >
              {showLabel}
            </Button>
            <Button type="button" variant="ghost" onClick={() => setDraft(defaults)}>
              Clear filters
            </Button>
          </>
        }
      >
        <div className="space-y-4">{children({ prefix: "sheet", value: draft, onChange: setDraft })}</div>
      </ResponsiveDialog>
    </>
  );
}
