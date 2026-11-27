"use client";

import * as React from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Banknote } from "lucide-react";
import { useFormat } from "@/components/format-provider";
import { AppPageHeader } from "@/components/layout/app-page-header";
import { useActiveSpace } from "@/components/layout/app-shell-client";
import { DateRangeFields } from "@/components/finance/filter-fields";
import { FilterBar } from "@/components/finance/filter-bar";
import { forMemberText, ListSkeleton, memberName, RecordAmount, sourceLabel, useReferenceData } from "@/components/finance/finance-parts";
import { MonthGroups, RecordCardButton, RecordRowButton } from "@/components/finance/month-groups";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { FormMessage } from "@/components/ui/form-message";
import { HemCard } from "@/components/ui/hem-card";
import { SelectField } from "@/components/ui/select-field";
import { useToast } from "@/components/ui/toast";
import type { IncomeEntryResponse } from "@/lib/api";
import { rangeError } from "@/lib/finance/common";
import { useHydrated } from "@/lib/hooks/use-hydrated";
import { useListHeading } from "@/lib/hooks/use-list-heading";
import { usePagedList } from "@/lib/hooks/use-paged-list";
import { listEntries } from "@/lib/income/client";
import { DEFAULT_ENTRY_FILTERS, entryFilterButtonLabel, isDefaultEntryFilters, SOURCE_TYPE_LABEL, type SourceType } from "@/lib/income/income";
import { EntryFormDialog } from "./entry-form-dialog";
import { IncomeNav } from "./income-nav";

/**
 * The income entries of the active space (finance.md 6.1). Keyed by the space id, so switching space
 * starts from the defaults and reads the new space's data.
 */
export function IncomeView() {
  const space = useActiveSpace();
  return <SpaceIncome key={space.id} spaceId={space.id} household={space.type === "household"} />;
}

type Form = { open: boolean; key: number; entry: IncomeEntryResponse | null };

function SpaceIncome({ spaceId, household }: { spaceId: string; household: boolean }) {
  const router = useRouter();
  const search = useSearchParams();
  const toast = useToast();
  const hydrated = useHydrated();
  const { calendarDate, money } = useFormat();
  const ref = useReferenceData(spaceId, household, { categories: false, sources: true });
  const { filters, list, applyFilters, refresh, loadMore, moreBusy, moreError } = usePagedList(spaceId, DEFAULT_ENTRY_FILTERS, listEntries);
  const [form, setForm] = React.useState<Form>({ open: search.get("new") === "1", key: 0, entry: null });
  const { ref: heading } = useListHeading();
  // Set after any save or delete: the row or the empty-state button that opened the dialog may be gone, so when the dialog closes focus goes to the list heading.
  const focusAfterClose = React.useRef(false);
  const finalFocus = React.useCallback(() => {
    if (!focusAfterClose.current) return null;
    focusAfterClose.current = false;
    return heading.current;
  }, [heading]);

  function openForm(entry: IncomeEntryResponse | null) {
    setForm((f) => ({ open: true, key: f.key + 1, entry }));
  }

  function closeForm() {
    setForm((f) => ({ ...f, open: false }));
    if (search.get("new") === "1") router.replace("/income");
  }

  const items = list.status === "ready" ? list.items : [];
  const emptyPage = list.status === "ready" && items.length === 0 && isDefaultEntryFilters(filters);
  const addButton = (
    <Button type="button" disabled={!hydrated} onClick={() => openForm(null)} data-testid="add-income">
      Add income
    </Button>
  );

  const title = (e: IncomeEntryResponse) => e.description?.trim() || (e.source_id ? sourceLabel(ref, e.source_id) : "") || "Income";
  const summary = (e: IncomeEntryResponse) =>
    `${title(e)}, ${money(e.amount, { currency: e.currency, signDisplay: "always" })}, ${calendarDate(e.received_on)}`;
  const sourceType = (e: IncomeEntryResponse) => {
    if (!e.source_id) return "No source";
    const type = ref.sources.find((s) => s.id === e.source_id)?.type as SourceType | undefined;
    return type ? SOURCE_TYPE_LABEL[type] : "";
  };
  const meta = (e: IncomeEntryResponse) => ["Income", sourceType(e), forMemberText(ref, household, e.member_user_id) ?? ""].filter(Boolean).join(" · ");

  return (
    <>
      <AppPageHeader
        title="Income"
        description="Money you receive, and where it comes from."
        primaryAction={emptyPage ? undefined : addButton}
      />
      <IncomeNav current="entries" />
      <h2 ref={heading} tabIndex={-1} className="sr-only outline-none">
        Your income
      </h2>

      <p className="sr-only" role="status" aria-live="polite" data-testid="result-count">
        {list.status === "ready" ? `${items.length} ${items.length === 1 ? "payment" : "payments"} shown${list.next ? ", more available" : ""}` : ""}
      </p>

      {emptyPage ? null : (
        <FilterBar
          filters={filters}
          defaults={DEFAULT_ENTRY_FILTERS}
          onApply={applyFilters}
          buttonLabel={entryFilterButtonLabel(filters)}
          showLabel="Show income"
          isValid={(f) => !rangeError(f.from, f.to)}
        >
          {({ prefix, value, onChange }) => (
            <>
              <DateRangeFields prefix={prefix} from={value.from} to={value.to} onChange={(range) => onChange({ ...value, ...range })} />
              <SelectField
                id={`${prefix}-source`}
                name="source_id"
                label="Source"
                value={value.source_id}
                onValueChange={(source_id) => onChange({ ...value, source_id })}
                options={ref.sources.map((s) => ({ value: s.id, label: s.name }))}
                emptyLabel="All sources"
              />
            </>
          )}
        </FilterBar>
      )}

      {list.status === "error" ? (
        <div data-testid="income-error">
          <FormMessage kind="error">We could not load your income just now.</FormMessage>
          <Button type="button" variant="outline" className="mt-3" onClick={refresh}>
            Retry
          </Button>
        </div>
      ) : list.status === "loading" ? (
        <ListSkeleton label="Loading income" testId="income-loading" />
      ) : emptyPage ? (
        <EmptyState
          icon={Banknote}
          space="active"
          title="No income recorded"
          description="Record a payment when it arrives, or add a regular source such as a salary."
          primaryAction={{ label: "Add income", onClick: () => openForm(null) }}
          secondaryAction={{ label: "Set up a regular source", href: "/income/sources" }}
        />
      ) : items.length === 0 ? (
        <HemCard data-testid="no-match">
          <EmptyState
            variant="inline"
            icon={Banknote}
            titleAs="h3"
            title="No matching income"
            description="Change or clear the filters to see more."
            primaryAction={{ label: "Clear filters", onClick: () => applyFilters(DEFAULT_ENTRY_FILTERS), ghost: true }}
          />
        </HemCard>
      ) : (
        <div data-testid="income-list">
          <MonthGroups
            items={items}
            dateOf={(e) => e.received_on}
            getRowKey={(e) => e.id}
            label="Income"
            noun="payment"
            more={list.next !== null}
            cardTestId="entry-card"
            rowTestId="entry-row"
            renderCard={(e) => (
              <RecordCardButton label={summary(e)} onClick={() => openForm(e)}>
                <span className="block min-w-0">
                  <span className="line-clamp-2 block break-words text-body-strong">{title(e)}</span>
                  <span className="mt-0.5 block text-small text-muted-foreground [overflow-wrap:anywhere]">{meta(e)}</span>
                </span>
                <span className="mt-2 flex items-end justify-between gap-3">
                  <span className="text-small text-muted-foreground">{calendarDate(e.received_on)}</span>
                  <RecordAmount amount={e.amount} currency={e.currency} signDisplay="always" />
                </span>
              </RecordCardButton>
            )}
            columns={[
              { id: "date", header: "Date", className: "whitespace-nowrap text-small", cell: (e) => calendarDate(e.received_on) },
              {
                id: "description",
                header: "Description",
                cell: (e) => (
                  <div className="min-w-0">
                    <RecordRowButton label={summary(e)} onClick={() => openForm(e)}>
                      {title(e)}
                    </RecordRowButton>
                    {/* From xl the table has Source and Applies to columns of its own. */}
                    <p className="text-small text-muted-foreground [overflow-wrap:anywhere] xl:hidden">{meta(e)}</p>
                    <p className="hidden text-small text-muted-foreground xl:block">Income</p>
                  </div>
                ),
              },
              { id: "source", header: "Source", from: "xl", className: "text-small", cell: (e) => (e.source_id ? sourceLabel(ref, e.source_id) : "No source") },
              ...(household
                ? [
                    {
                      id: "applies",
                      header: "Applies to",
                      from: "xl" as const,
                      className: "text-small",
                      cell: (e: IncomeEntryResponse) => (e.member_user_id ? memberName(ref, e.member_user_id) : "Household"),
                    },
                  ]
                : []),
              { id: "amount", header: "Amount", align: "right", cell: (e) => <RecordAmount amount={e.amount} currency={e.currency} signDisplay="always" /> },
            ]}
          />
          {list.next ? (
            <div className="mt-4">
              <Button type="button" variant="outline" className="w-full md:w-auto" disabled={moreBusy} aria-busy={moreBusy || undefined} onClick={loadMore} data-testid="load-more">
                {moreBusy ? "Loading…" : "Show more income"}
              </Button>
            </div>
          ) : null}
          {moreError ? (
            <div className="mt-3">
              <FormMessage kind="error">We could not load more income just now.</FormMessage>
            </div>
          ) : null}
        </div>
      )}

      <EntryFormDialog
        key={form.key}
        open={form.open}
        onOpenChange={(open) => (open ? setForm((f) => ({ ...f, open: true })) : closeForm())}
        spaceId={spaceId}
        entry={form.entry}
        reference={ref}
        finalFocus={finalFocus}
        onSaved={() => {
          const edited = form.entry !== null;
          focusAfterClose.current = true;
          closeForm();
          toast(edited ? "Income saved." : "Income added.");
          refresh();
        }}
        onDeleted={() => {
          focusAfterClose.current = true;
          closeForm();
          toast("Income deleted.");
          refresh();
        }}
      />
    </>
  );
}
