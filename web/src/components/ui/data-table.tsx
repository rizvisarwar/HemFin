import * as React from "react";
import { cn } from "@/lib/utils";

export interface DataTableColumn<T> {
  id: string;
  /** Column heading. Use `srOnlyHeader` for a column with no visible title (actions). */
  header: string;
  cell: (row: T) => React.ReactNode;
  /** Right-align the heading and the cells (dates, amounts, actions). */
  align?: "left" | "right";
  /** Hide the column below this breakpoint (it is still a column from there up). */
  from?: "md" | "xl";
  /** Hide the column from this breakpoint up, for a column that another one replaces. */
  until?: "xl";
  srOnlyHeader?: boolean;
  className?: string;
}

export interface DataTableProps<T> {
  columns: DataTableColumn<T>[];
  rows: T[];
  getRowKey: (row: T) => string;
  /** Names the table for screen readers. */
  label: string;
  /** Extra full-width content under a row (a row message). Return null for none. */
  rowFooter?: (row: T) => React.ReactNode;
  rowTestId?: string;
  /** Shown from md up only: pair it with `ResponsiveList`, which shows from the phone width up to md. */
  className?: string;
}

const SHOW_FROM = { md: "hidden md:table-cell", xl: "hidden xl:table-cell" } as const;
const HIDE_FROM = { xl: "xl:hidden" } as const;

function cellClasses<T>(c: DataTableColumn<T>) {
  return cn(
    c.from && SHOW_FROM[c.from],
    c.until && HIDE_FROM[c.until],
    c.align === "right" && "text-right",
    c.className,
  );
}

/**
 * The shared table (docs/design/design-system.md section 7, Table). It is shown from `md` up, and
 * `ResponsiveList` is its phone counterpart: a screen renders both with the same rows, so tables
 * become card lists on phones. Presentational only: columns say how to render a row, the screen
 * owns the data and the actions.
 */
export function DataTable<T>({ columns, rows, getRowKey, label, rowFooter, rowTestId, className }: DataTableProps<T>) {
  return (
    <div className={cn("hidden overflow-hidden rounded-lg border border-border bg-card md:block", className)}>
      <table className="w-full text-left" aria-label={label}>
        <thead className="border-b border-border text-small text-muted-foreground">
          <tr>
            {columns.map((c) => (
              <th key={c.id} scope="col" className={cn("px-4 py-3 font-medium", cellClasses(c))}>
                {c.srOnlyHeader ? <span className="sr-only">{c.header}</span> : c.header}
              </th>
            ))}
          </tr>
        </thead>
        {rows.map((row) => {
          const footer = rowFooter?.(row);
          return (
            // One tbody per row, so a row and its message stay together and the dividers are drawn once.
            <tbody key={getRowKey(row)} data-testid={rowTestId} className="border-b border-border last:border-b-0">
              <tr>
                {columns.map((c) => (
                  <td key={c.id} className={cn("px-4 py-3 align-middle", cellClasses(c))}>
                    {c.cell(row)}
                  </td>
                ))}
              </tr>
              {footer ? (
                <tr>
                  <td colSpan={columns.length} className="px-4 pb-3">
                    {footer}
                  </td>
                </tr>
              ) : null}
            </tbody>
          );
        })}
      </table>
    </div>
  );
}
