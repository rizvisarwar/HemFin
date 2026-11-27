"use client";

import * as React from "react";
import { useFormat } from "@/components/format-provider";
import { DataTable, type DataTableColumn } from "@/components/ui/data-table";
import { MonthHeader } from "@/components/ui/month-header";
import { ResponsiveList } from "@/components/ui/responsive-list";
import { groupByMonth, monthTitle } from "@/lib/finance/common";

export interface MonthGroupsProps<T> {
  items: T[];
  /** The record's calendar date ("2026-11-12"): decides its month. */
  dateOf: (item: T) => string;
  getRowKey: (item: T) => string;
  /** Names the lists for screen readers, for example "Expenses". Each month adds its own title. */
  label: string;
  /** "expense" gives "5 expenses" and "1 expense". */
  noun: string;
  /** More pages exist, so the last month may continue: its count says "so far" (the browser never guesses a total, F10). */
  more: boolean;
  renderCard: (item: T) => React.ReactNode;
  columns: DataTableColumn<T>[];
  cardTestId: string;
  rowTestId: string;
}

/**
 * A newest-first list grouped by calendar month (finance.md F10, 5.1): a month heading (an h2), then
 * cards on a phone and a table from md. Presentational: the screen owns the data and the actions.
 */
export function MonthGroups<T>({ items, dateOf, getRowKey, label, noun, more, renderCard, columns, cardTestId, rowTestId }: MonthGroupsProps<T>) {
  const { prefs } = useFormat();
  const groups = groupByMonth(items, dateOf);
  return (
    <>
      {groups.map((g, i) => {
        const title = monthTitle(g.key, prefs.locale);
        const open = more && i === groups.length - 1;
        const count = `${g.items.length} ${g.items.length === 1 ? noun : `${noun}s`}`;
        return (
          <section key={g.key} className="mb-4">
            <MonthHeader title={title} summary={open ? `${count} so far` : count} />
            <div className="mt-3">
              <ResponsiveList label={`${label}, ${title}`} rows={g.items} getRowKey={getRowKey} cardTestId={cardTestId} renderCard={renderCard} />
              <DataTable label={`${label}, ${title}`} rows={g.items} getRowKey={getRowKey} rowTestId={rowTestId} columns={columns} />
            </div>
          </section>
        );
      })}
    </>
  );
}

/** A whole card as one button that opens the editor (finance.md 5.1). The label is the accessible name: title, amount, date. */
export function RecordCardButton({ label, onClick, children }: { label: string; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      aria-label={label}
      onClick={onClick}
      className="-m-4 block w-[calc(100%+2rem)] rounded-lg p-4 text-left outline-none hover:bg-muted/50 focus-visible:ring-3 focus-visible:ring-ring/50"
    >
      {children}
    </button>
  );
}

/** The title of a table row as a button that opens the editor (at least 44 px tall). */
export function RecordRowButton({ label, onClick, children }: { label: string; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      aria-label={label}
      onClick={onClick}
      className="inline-flex min-h-11 max-w-full items-center break-words rounded-md text-left text-body-strong underline-offset-4 outline-none hover:underline focus-visible:ring-3 focus-visible:ring-ring/50"
    >
      <span className="line-clamp-2 [overflow-wrap:anywhere]">{children}</span>
    </button>
  );
}
