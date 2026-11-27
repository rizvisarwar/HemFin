"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { FileText, ListFilter } from "lucide-react";
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
import { ResponsiveDialog } from "@/components/ui/responsive-dialog";
import { ResponsiveList } from "@/components/ui/responsive-list";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/components/ui/toast";
import { useHydrated } from "@/lib/hooks/use-hydrated";
import type { ContractResponse } from "@/lib/api";
import { listContracts } from "@/lib/contracts/client";
import {
  categoryGroups,
  DEFAULT_FILTERS,
  filterButtonLabel,
  isDefaultFilters,
  STATUS_LABEL,
  type ContractFilters,
  type StatusFilter,
} from "@/lib/contracts/contracts";
import { ContractFormDialog } from "./contract-form-dialog";
import {
  categoryName,
  ContractAmount,
  memberLabel,
  SoonChips,
  soonChips,
  useReferenceData,
  useToday,
  type ReferenceData,
} from "./contract-parts";

type List =
  | { status: "loading" }
  | { status: "error" }
  | { status: "ready"; items: ContractResponse[]; next: string | null };

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

  const [filters, setFilters] = React.useState<ContractFilters>(DEFAULT_FILTERS);
  const [list, setList] = React.useState<List>({ status: "loading" });
  const [reload, setReload] = React.useState(0);
  const [moreBusy, setMoreBusy] = React.useState(false);
  const [moreError, setMoreError] = React.useState(false);
  const [message, setMessage] = React.useState<string | null>(null);
  const [formOpen, setFormOpen] = React.useState(search.get("new") === "1");
  const [formKey, setFormKey] = React.useState(0);
  const [filterOpen, setFilterOpen] = React.useState(false);
  const [draft, setDraft] = React.useState<ContractFilters>(DEFAULT_FILTERS);
  const heading = React.useRef<HTMLHeadingElement>(null);

  React.useEffect(() => {
    let live = true;
    listContracts(spaceId, filters).then((res) => {
      if (!live) return;
      setList(res.ok ? { status: "ready", items: res.data.items, next: res.data.next_cursor ?? null } : { status: "error" });
    });
    return () => {
      live = false;
    };
  }, [spaceId, filters, reload]);

  // The success message goes after 5 seconds.
  React.useEffect(() => {
    if (!message) return;
    const t = setTimeout(() => setMessage(null), 5000);
    return () => clearTimeout(t);
  }, [message]);

  function applyFilters(next: ContractFilters) {
    setList({ status: "loading" });
    setMoreError(false);
    setFilters(next);
  }

  function refresh() {
    setList({ status: "loading" });
    setReload((n) => n + 1);
  }

  function openForm() {
    setFormKey((n) => n + 1);
    setFormOpen(true);
  }

  function closeForm() {
    setFormOpen(false);
    if (search.get("new") === "1") router.replace("/contracts");
  }

  async function loadMore() {
    if (list.status !== "ready" || !list.next || moreBusy) return;
    setMoreBusy(true);
    setMoreError(false);
    const res = await listContracts(spaceId, filters, list.next);
    setMoreBusy(false);
    if (!res.ok) return setMoreError(true);
    setList({ status: "ready", items: [...list.items, ...res.data.items], next: res.data.next_cursor ?? null });
  }

  const groups = React.useMemo(() => categoryGroups(ref.categories, "key"), [ref.categories]);
  const members = ref.members;
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

      {emptyPage ? null : (
        <>
          {/* md and up: the filters sit in a row and apply at once. */}
          <div className="mb-4 hidden gap-4 md:grid md:grid-cols-3" data-testid="filter-row">
            <FilterControls prefix="filter" value={filters} onChange={applyFilters} groups={groups} members={members} household={household} />
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
              setFilterOpen(true);
            }}
          >
            <ListFilter aria-hidden="true" />
            {filterButtonLabel(filters)}
          </Button>
        </>
      )}

      {list.status === "error" ? (
        <div data-testid="contracts-error">
          <FormMessage kind="error">We could not load your contracts just now.</FormMessage>
          <Button type="button" variant="outline" className="mt-3" onClick={refresh}>
            Retry
          </Button>
        </div>
      ) : list.status === "loading" ? (
        <ListSkeleton />
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
            primaryAction={{ label: "Clear filters", onClick: () => applyFilters(DEFAULT_FILTERS) }}
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
                      {[c.provider, categoryName(ref.categories, c.category)].filter(Boolean).join(" · ")}
                    </span>
                    {household && c.member_user_id ? (
                      <span className="block text-small text-muted-foreground">
                        For {memberLabel(members.find((m) => m.user_id === c.member_user_id) ?? { display_name: null })}
                      </span>
                    ) : null}
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
                    {household && c.member_user_id ? (
                      <p className="text-small text-muted-foreground">
                        For {memberLabel(members.find((m) => m.user_id === c.member_user_id) ?? { display_name: null })}
                      </p>
                    ) : null}
                  </div>
                ),
              },
              { id: "category", header: "Category", from: "xl", className: "text-small", cell: (c) => categoryName(ref.categories, c.category) },
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

      <ResponsiveDialog
        open={filterOpen}
        onOpenChange={setFilterOpen}
        title="Filters"
        footer={
          <>
            <Button
              type="button"
              onClick={() => {
                applyFilters(draft);
                setFilterOpen(false);
              }}
            >
              Show contracts
            </Button>
            <Button type="button" variant="ghost" onClick={() => setDraft(DEFAULT_FILTERS)}>
              Clear filters
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          <FilterControls prefix="sheet" value={draft} onChange={setDraft} groups={groups} members={members} household={household} />
        </div>
      </ResponsiveDialog>
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
      {household ? (
        <div className="space-y-2">
          <Label htmlFor={`${prefix}-applies`} className="text-body">
            Applies to
          </Label>
          <NativeSelect id={`${prefix}-applies`} value={value.applies} onChange={(e) => onChange({ ...value, applies: e.target.value })}>
            <option value="all">All</option>
            <option value="household">Whole household</option>
            {members.map((m) => (
              <option key={m.user_id} value={m.user_id}>
                {memberLabel(m)}
              </option>
            ))}
          </NativeSelect>
        </div>
      ) : null}
    </>
  );
}

function ListSkeleton() {
  return (
    <div aria-busy="true" data-testid="contracts-loading">
      <p className="sr-only" role="status">
        Loading contracts
      </p>
      <div className="space-y-3 md:hidden">
        {[0, 1, 2].map((i) => (
          <Skeleton key={i} className="h-32 w-full" />
        ))}
      </div>
      <div className="hidden space-y-2 md:block">
        {[0, 1, 2].map((i) => (
          <Skeleton key={i} className="h-16 w-full" />
        ))}
      </div>
    </div>
  );
}
