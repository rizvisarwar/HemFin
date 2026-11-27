"use client";

import * as React from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Receipt, X } from "lucide-react";
import { useFormat } from "@/components/format-provider";
import { AppPageHeader } from "@/components/layout/app-page-header";
import { useActiveSpace } from "@/components/layout/app-shell-client";
import { AppliesFilter, DateRangeFields } from "@/components/finance/filter-fields";
import { FilterBar } from "@/components/finance/filter-bar";
import {
  categoryLabel,
  contractLabel,
  forMemberText,
  ListSkeleton,
  memberName,
  RecordAmount,
  useReferenceData,
} from "@/components/finance/finance-parts";
import { MonthGroups, RecordCardButton, RecordRowButton } from "@/components/finance/month-groups";
import { Button } from "@/components/ui/button";
import { CategorySelect } from "@/components/ui/category-select";
import { EmptyState } from "@/components/ui/empty-state";
import { FormMessage } from "@/components/ui/form-message";
import { HemCard } from "@/components/ui/hem-card";
import { useToast } from "@/components/ui/toast";
import type { ExpenseResponse } from "@/lib/api";
import { listExpenses } from "@/lib/expenses/client";
import {
  DEFAULT_FILTERS,
  filterButtonLabel,
  isDefaultFilters,
  type ExpenseFilters,
} from "@/lib/expenses/expenses";
import { categoryGroups, isUuid, rangeError } from "@/lib/finance/common";
import { useHydrated } from "@/lib/hooks/use-hydrated";
import { useListHeading } from "@/lib/hooks/use-list-heading";
import { usePagedList } from "@/lib/hooks/use-paged-list";
import { ExpenseFormDialog } from "./expense-form-dialog";

/**
 * The expenses of the active space (finance.md 5.1). Keyed by the space id, so switching space starts
 * from the defaults and reads the new space's data.
 */
export function ExpensesView() {
  const space = useActiveSpace();
  return <SpaceExpenses key={space.id} spaceId={space.id} household={space.type === "household"} />;
}

type Form = { open: boolean; key: number; expense: ExpenseResponse | null };

function SpaceExpenses({ spaceId, household }: { spaceId: string; household: boolean }) {
  const router = useRouter();
  const search = useSearchParams();
  const toast = useToast();
  const hydrated = useHydrated();
  const { calendarDate, money, prefs } = useFormat();
  const ref = useReferenceData(spaceId, household, { contracts: true });

  // `?contract_id=` comes from the contract page's "Expenses for this contract" link.
  const fromLink = search.get("contract_id");
  const initial = React.useMemo<ExpenseFilters>(() => ({ ...DEFAULT_FILTERS, contract_id: isUuid(fromLink) ? fromLink : "" }), [fromLink]);
  const { filters, list, applyFilters, refresh, loadMore, moreBusy, moreError } = usePagedList(spaceId, initial, listExpenses);
  const [form, setForm] = React.useState<Form>({ open: search.get("new") === "1", key: 0, expense: null });
  const { ref: heading } = useListHeading();
  // Set after any save or delete: the row or the empty-state button that opened the dialog may be gone, so when the dialog closes focus goes to the list heading.
  const focusAfterClose = React.useRef(false);
  const finalFocus = React.useCallback(() => {
    if (!focusAfterClose.current) return null;
    focusAfterClose.current = false;
    return heading.current;
  }, [heading]);

  function openForm(expense: ExpenseResponse | null) {
    setForm((f) => ({ open: true, key: f.key + 1, expense }));
  }

  function closeForm() {
    setForm((f) => ({ ...f, open: false }));
    if (search.get("new") === "1") {
      const next = new URLSearchParams(search.toString());
      next.delete("new");
      router.replace(next.size ? `/expenses?${next}` : "/expenses");
    }
  }

  const groups = React.useMemo(() => categoryGroups(ref.categories, "key"), [ref.categories]);
  const items = list.status === "ready" ? list.items : [];
  const emptyPage = list.status === "ready" && items.length === 0 && isDefaultFilters(filters);
  const addButton = (
    <Button type="button" disabled={!hydrated} onClick={() => openForm(null)} data-testid="add-expense">
      Add an expense
    </Button>
  );

  const title = (e: ExpenseResponse) => e.description?.trim() || categoryLabel(ref, e.category);
  const summary = (e: ExpenseResponse) =>
    `${title(e)}, ${money(e.amount, { currency: e.currency, code: e.currency !== prefs.currency })}, ${calendarDate(e.spent_on)}`;
  // From xl the table has Category and Applies to columns of its own, so its meta line leaves them out.
  const meta = (e: ExpenseResponse, withColumns: boolean) =>
    [
      withColumns ? categoryLabel(ref, e.category) : "",
      e.merchant ?? "",
      withColumns ? (forMemberText(ref, household, e.member_user_id) ?? "") : "",
      e.contract_id ? (contractLabel(ref, e.contract_id) ? `Linked to ${contractLabel(ref, e.contract_id)}` : "") : "",
    ]
      .filter(Boolean)
      .join(" · ");

  return (
    <>
      <AppPageHeader
        title="Expenses"
        description="Record one-off payments to see where the money goes."
        primaryAction={emptyPage ? undefined : addButton}
      />
      <h2 ref={heading} tabIndex={-1} className="sr-only outline-none">
        Your expenses
      </h2>

      <p className="sr-only" role="status" aria-live="polite" data-testid="result-count">
        {list.status === "ready" ? `${items.length} ${items.length === 1 ? "expense" : "expenses"} shown${list.next ? ", more available" : ""}` : ""}
      </p>

      {emptyPage ? null : (
        <>
          <FilterBar
            filters={filters}
            defaults={DEFAULT_FILTERS}
            onApply={applyFilters}
            buttonLabel={filterButtonLabel(filters)}
            showLabel="Show expenses"
            isValid={(f) => !rangeError(f.from, f.to)}
            rowClassName={household ? "md:grid-cols-4" : "md:grid-cols-3"}
          >
            {({ prefix, value, onChange }) => (
              <>
                <DateRangeFields prefix={prefix} from={value.from} to={value.to} onChange={(range) => onChange({ ...value, ...range })} />
                <CategorySelect
                  id={`${prefix}-category`}
                  name="category"
                  label="Category"
                  groups={groups}
                  value={value.category}
                  onValueChange={(category) => onChange({ ...value, category })}
                  emptyLabel="All categories"
                />
                {household ? (
                  <AppliesFilter prefix={prefix} value={value.applies} onChange={(applies) => onChange({ ...value, applies })} members={ref.members} />
                ) : null}
              </>
            )}
          </FilterBar>
          {filters.contract_id ? (
            <div className="mb-4">
              {/* The chip is its label plus a remove button with its own 44 px hit area (finance.md 5.1, 9). */}
              <span className="inline-flex min-h-11 items-center rounded-md border border-border bg-background pl-3" data-testid="contract-chip">
                <span className="text-body">{contractLabel(ref, filters.contract_id) || "Contract"}</span>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  aria-label={`Remove filter: ${contractLabel(ref, filters.contract_id) || "this contract"}`}
                  onClick={() => applyFilters({ ...filters, contract_id: "" })}
                  data-testid="contract-chip-remove"
                >
                  <X aria-hidden="true" />
                </Button>
              </span>
            </div>
          ) : null}
        </>
      )}

      {list.status === "error" ? (
        <div data-testid="expenses-error">
          <FormMessage kind="error">We could not load your expenses just now.</FormMessage>
          <Button type="button" variant="outline" className="mt-3" onClick={refresh}>
            Retry
          </Button>
        </div>
      ) : list.status === "loading" ? (
        <ListSkeleton label="Loading expenses" testId="expenses-loading" />
      ) : emptyPage ? (
        <EmptyState
          icon={Receipt}
          space="active"
          title="No expenses this month"
          description="Record one-off payments to see where the money goes."
          primaryAction={{ label: "Add an expense", onClick: () => openForm(null) }}
        />
      ) : items.length === 0 ? (
        <HemCard data-testid="no-match">
          <EmptyState
            variant="inline"
            icon={Receipt}
            titleAs="h3"
            title="No matching expenses"
            description="Change or clear the filters to see more."
            primaryAction={{ label: "Clear filters", onClick: () => applyFilters(DEFAULT_FILTERS), ghost: true }}
          />
        </HemCard>
      ) : (
        <div data-testid="expenses-list">
          <MonthGroups
            items={items}
            dateOf={(e) => e.spent_on}
            getRowKey={(e) => e.id}
            label="Expenses"
            noun="expense"
            more={list.next !== null}
            cardTestId="expense-card"
            rowTestId="expense-row"
            renderCard={(e) => (
              <RecordCardButton label={summary(e)} onClick={() => openForm(e)}>
                <span className="flex items-start justify-between gap-3">
                  <span className="min-w-0 flex-1">
                    <span className="line-clamp-2 block break-words text-body-strong">{title(e)}</span>
                    <span className="mt-0.5 block text-small text-muted-foreground [overflow-wrap:anywhere]">{meta(e, true)}</span>
                  </span>
                </span>
                <span className="mt-2 flex items-end justify-between gap-3">
                  <span className="text-small text-muted-foreground">{calendarDate(e.spent_on)}</span>
                  <RecordAmount amount={e.amount} currency={e.currency} base={e.base_amount} />
                </span>
              </RecordCardButton>
            )}
            columns={[
              { id: "date", header: "Date", from: "md", className: "whitespace-nowrap text-small", cell: (e) => calendarDate(e.spent_on) },
              {
                id: "description",
                header: "Description",
                cell: (e) => (
                  <div className="min-w-0">
                    <RecordRowButton label={summary(e)} onClick={() => openForm(e)}>
                      {title(e)}
                    </RecordRowButton>
                    <p className="text-small text-muted-foreground [overflow-wrap:anywhere] xl:hidden">{meta(e, true)}</p>
                    <p className="hidden text-small text-muted-foreground [overflow-wrap:anywhere] xl:block">{meta(e, false)}</p>
                  </div>
                ),
              },
              { id: "category", header: "Category", from: "xl", className: "text-small", cell: (e) => categoryLabel(ref, e.category) },
              ...(household
                ? [
                    {
                      id: "applies",
                      header: "Applies to",
                      from: "xl" as const,
                      className: "text-small",
                      cell: (e: ExpenseResponse) => (e.member_user_id ? memberName(ref, e.member_user_id) : "Household"),
                    },
                  ]
                : []),
              { id: "amount", header: "Amount", align: "right", cell: (e) => <RecordAmount amount={e.amount} currency={e.currency} base={e.base_amount} /> },
            ]}
          />
          {list.next ? (
            <div className="mt-4">
              <Button type="button" variant="outline" className="w-full md:w-auto" disabled={moreBusy} aria-busy={moreBusy || undefined} onClick={loadMore} data-testid="load-more">
                {moreBusy ? "Loading…" : "Show more expenses"}
              </Button>
            </div>
          ) : null}
          {moreError ? (
            <div className="mt-3">
              <FormMessage kind="error">We could not load more expenses just now.</FormMessage>
            </div>
          ) : null}
        </div>
      )}

      <ExpenseFormDialog
        key={form.key}
        open={form.open}
        onOpenChange={(open) => (open ? setForm((f) => ({ ...f, open: true })) : closeForm())}
        spaceId={spaceId}
        expense={form.expense}
        reference={ref}
        finalFocus={finalFocus}
        onSaved={(saved, again) => {
          const edited = form.expense !== null;
          // The opener may be gone after the reload (the empty state's button), so focus goes to the list heading.
          if (!again) {
            focusAfterClose.current = true;
            closeForm();
          }
          toast(edited ? "Expense saved." : again ? "Expense added. Add another." : "Expense added.");
          refresh();
        }}
        onDeleted={() => {
          focusAfterClose.current = true;
          closeForm();
          toast("Expense deleted.");
          refresh();
        }}
      />
    </>
  );
}
