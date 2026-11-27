"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { FileText } from "lucide-react";
import { useFormat } from "@/components/format-provider";
import { AppPageHeader } from "@/components/layout/app-page-header";
import { useActiveSpace } from "@/components/layout/app-shell-client";
import { Button } from "@/components/ui/button";
import { CategorySelect } from "@/components/ui/category-select";
import { DataTable } from "@/components/ui/data-table";
import { EmptyState } from "@/components/ui/empty-state";
import { FormMessage } from "@/components/ui/form-message";
import { HemCard } from "@/components/ui/hem-card";
import { Label } from "@/components/ui/label";
import { NativeSelect } from "@/components/ui/native-select";
import { ResponsiveList } from "@/components/ui/responsive-list";
import { useToast } from "@/components/ui/toast";
import type { ContractResponse } from "@/lib/api";
import { AppliesFilter } from "@/components/finance/filter-fields";
import { FilterBar } from "@/components/finance/filter-bar";
import { categoryLabel, forMemberText, ListSkeleton, useReferenceData, useToday, type ReferenceData } from "@/components/finance/finance-parts";
import { useHydrated } from "@/lib/hooks/use-hydrated";
import { useListHeading } from "@/lib/hooks/use-list-heading";
import { usePagedList } from "@/lib/hooks/use-paged-list";
import { listContracts } from "@/lib/contracts/client";
import {
  DEFAULT_FILTERS,
  filterButtonLabel,
  isDefaultFilters,
  STATUS_LABEL,
  type ContractFilters,
  type StatusFilter,
} from "@/lib/contracts/contracts";
import { categoryGroups } from "@/lib/finance/common";
import { ContractFormDialog } from "./contract-form-dialog";
import { ContractAmount, SoonChips, soonChips } from "./contract-parts";

/**
 * The contracts of the active space (finance.md 4.1). Keyed by the space id, so switching space starts
 * from the defaults and reads the new space's data.
 */
export function ContractsView() {
  const space = useActiveSpace();
  return <SpaceContracts key={space.id} spaceId={space.id} household={space.type === "household"} />;
}

function SpaceContracts({ spaceId, household }: { spaceId: string; household: boolean }) {
  const router = useRouter();
  const search = useSearchParams();
  const toast = useToast();
  const hydrated = useHydrated();
  const { calendarDate } = useFormat();
  const today = useToday();
  const ref = useReferenceData(spaceId, household);

  const { filters, list, applyFilters, refresh, loadMore, moreBusy, moreError } = usePagedList(spaceId, DEFAULT_FILTERS, listContracts);
  const [message, setMessage] = React.useState<string | null>(null);
  const [formOpen, setFormOpen] = React.useState(search.get("new") === "1");
  const [formKey, setFormKey] = React.useState(0);
  const { ref: heading, focus: focusHeading } = useListHeading();

  // After a delete the detail page sends the user here: focus the list heading (the row they came from is gone).
  const afterDelete = search.get("deleted") === "1";
  React.useEffect(() => {
    if (!afterDelete || list.status === "loading") return;
    focusHeading();
    router.replace("/contracts");
  }, [afterDelete, list.status, router, focusHeading]);

  // The success message goes after 5 seconds.
  React.useEffect(() => {
    if (!message) return;
    const t = setTimeout(() => setMessage(null), 5000);
    return () => clearTimeout(t);
  }, [message]);

  function openForm() {
    setFormKey((n) => n + 1);
    setFormOpen(true);
  }

  function closeForm() {
    setFormOpen(false);
    if (search.get("new") === "1") router.replace("/contracts");
  }

  const groups = React.useMemo(() => categoryGroups(ref.categories, "key"), [ref.categories]);
  const members = ref.members;
  const forMember = (c: ContractResponse) => forMemberText(ref, household, c.member_user_id);
  const items = list.status === "ready" ? list.items : [];
  const emptyPage = list.status === "ready" && items.length === 0 && isDefaultFilters(filters);
  const addButton = (
    <Button type="button" disabled={!hydrated} onClick={openForm} data-testid="add-contract">
      Add a contract
    </Button>
  );

  return (
    <>
      <AppPageHeader
        title="Contracts"
        description="Insurance, subscriptions and bills."
        primaryAction={emptyPage ? undefined : addButton}
      />
      <h2 ref={heading} tabIndex={-1} className="sr-only outline-none">
        Your contracts
      </h2>

      <FormMessage kind="success">{message}</FormMessage>
      <p className="sr-only" role="status" aria-live="polite" data-testid="result-count">
        {list.status === "ready" ? `${items.length} ${items.length === 1 ? "contract" : "contracts"} shown${list.next ? ", more available" : ""}` : ""}
      </p>

      {emptyPage ? null : (
        <FilterBar filters={filters} defaults={DEFAULT_FILTERS} onApply={applyFilters} buttonLabel={filterButtonLabel(filters)} showLabel="Show contracts">
          {({ prefix, value, onChange }) => (
            <FilterControls prefix={prefix} value={value} onChange={onChange} groups={groups} members={members} household={household} />
          )}
        </FilterBar>
      )}

      {list.status === "error" ? (
        <div data-testid="contracts-error">
          <FormMessage kind="error">We could not load your contracts just now.</FormMessage>
          <Button type="button" variant="outline" className="mt-3" onClick={refresh}>
            Retry
          </Button>
        </div>
      ) : list.status === "loading" ? (
        <ListSkeleton label="Loading contracts" testId="contracts-loading" cardClass="h-32" />
      ) : emptyPage ? (
        <EmptyState
          icon={FileText}
          space="active"
          title="No contracts yet"
          description="Add insurance, subscriptions and bills in one place. We will remind you before each one renews."
          primaryAction={{ label: "Add a contract", onClick: openForm }}
        />
      ) : items.length === 0 ? (
        <HemCard data-testid="no-match">
          <EmptyState
            variant="inline"
            icon={FileText}
            titleAs="h3"
            title="No matching contracts"
            description="Change or clear the filters to see more."
            primaryAction={{ label: "Clear filters", onClick: () => applyFilters(DEFAULT_FILTERS), ghost: true }}
          />
        </HemCard>
      ) : (
        <div data-testid="contracts-list">
          <ResponsiveList
            label="Contracts"
            rows={items}
            getRowKey={(c) => c.id}
            cardTestId="contract-card"
            renderCard={(c) => (
              <Link
                href={`/contracts/${c.id}`}
                className="-m-4 block rounded-lg p-4 outline-none hover:bg-muted/50 focus-visible:ring-3 focus-visible:ring-ring/50"
              >
                <span className="flex items-start justify-between gap-3">
                  <span className="min-w-0 flex-1">
                    <span className="line-clamp-2 block break-words text-body-strong">{c.name}</span>
                    <span className="mt-0.5 block text-small text-muted-foreground [overflow-wrap:anywhere]">
                      {[c.provider, categoryLabel(ref, c.category)].filter(Boolean).join(" · ")}
                    </span>
                    {forMember(c) ? <span className="block text-small text-muted-foreground">{forMember(c)}</span> : null}
                  </span>
                  <ContractAmount contract={c} />
                </span>
                <span className="mt-2 block text-small text-muted-foreground">
                  {c.schedule.renewal_date ? `Renews ${calendarDate(c.schedule.renewal_date)}` : "No renewal date"}
                </span>
                <SoonChips chips={soonChips(c, today)} className="mt-2" />
              </Link>
            )}
          />
          <DataTable
            label="Contracts"
            rows={items}
            getRowKey={(c) => c.id}
            rowTestId="contract-row"
            columns={[
              {
                id: "contract",
                header: "Contract",
                cell: (c) => (
                  <div className="min-w-0">
                    <Link href={`/contracts/${c.id}`} className="inline-flex min-h-11 items-center break-words text-body-strong underline-offset-4 hover:underline">
                      {c.name}
                    </Link>
                    {c.provider ? <p className="text-small text-muted-foreground [overflow-wrap:anywhere]">{c.provider}</p> : null}
                    {forMember(c) ? <p className="text-small text-muted-foreground">{forMember(c)}</p> : null}
                  </div>
                ),
              },
              { id: "category", header: "Category", from: "xl", className: "text-small", cell: (c) => categoryLabel(ref, c.category) },
              { id: "amount", header: "Amount", from: "md", align: "right", cell: (c) => <ContractAmount contract={c} /> },
              {
                id: "next",
                header: "Next payment",
                from: "md",
                cell: (c) => (
                  <div className="space-y-1">
                    <p className="text-small">{c.schedule.next_payment_date ? calendarDate(c.schedule.next_payment_date) : "None due"}</p>
                    <SoonChips chips={soonChips(c, today).filter((x) => x.key === "payment")} />
                  </div>
                ),
              },
              {
                id: "renews",
                header: "Renewal and notice",
                from: "xl",
                cell: (c) => (
                  <div className="space-y-1">
                    <p className="text-small">{c.schedule.renewal_date ? calendarDate(c.schedule.renewal_date) : "No renewal date"}</p>
                    <SoonChips chips={soonChips(c, today).filter((x) => x.key !== "payment")} />
                  </div>
                ),
              },
            ]}
          />
          {list.next ? (
            <div className="mt-4">
              <Button type="button" variant="outline" className="w-full md:w-auto" disabled={moreBusy} aria-busy={moreBusy || undefined} onClick={loadMore} data-testid="load-more">
                {moreBusy ? "Loading…" : "Show more contracts"}
              </Button>
            </div>
          ) : null}
          {moreError ? (
            <div className="mt-3">
              <FormMessage kind="error">We could not load more contracts just now.</FormMessage>
            </div>
          ) : null}
        </div>
      )}

      <ContractFormDialog
        key={formKey}
        open={formOpen}
        onOpenChange={(open) => (open ? setFormOpen(true) : closeForm())}
        spaceId={spaceId}
        contract={null}
        referenceStatus={ref.status}
        onRetryReference={ref.retry}
        categories={ref.categories}
        members={ref.members}
        onSaved={() => {
          closeForm();
          setMessage("Contract saved.");
          toast("Contract saved");
          refresh();
        }}
      />
    </>
  );
}

function FilterControls({
  prefix,
  value,
  onChange,
  groups,
  members,
  household,
}: {
  prefix: string;
  value: ContractFilters;
  onChange: (next: ContractFilters) => void;
  groups: ReturnType<typeof categoryGroups>;
  members: ReferenceData["members"];
  household: boolean;
}) {
  return (
    <>
      <div className="space-y-2">
        <Label htmlFor={`${prefix}-status`} className="text-body">
          Status
        </Label>
        <NativeSelect id={`${prefix}-status`} value={value.status} onChange={(e) => onChange({ ...value, status: e.target.value as StatusFilter })}>
          {(Object.keys(STATUS_LABEL) as StatusFilter[]).map((s) => (
            <option key={s} value={s}>
              {STATUS_LABEL[s]}
            </option>
          ))}
        </NativeSelect>
      </div>
      <CategorySelect
        id={`${prefix}-category`}
        name="category"
        label="Category"
        groups={groups}
        value={value.category}
        onValueChange={(category) => onChange({ ...value, category })}
        emptyLabel="All categories"
      />
      {household ? <AppliesFilter prefix={prefix} value={value.applies} onChange={(applies) => onChange({ ...value, applies })} members={members} /> : null}
    </>
  );
}
