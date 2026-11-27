"use client";

import * as React from "react";
import { useActiveSpace } from "@/components/layout/app-shell-client";
import { Button } from "@/components/ui/button";
import { FormMessage } from "@/components/ui/form-message";
import { MoneyText } from "@/components/ui/money-text";
import { ResponsiveDialog } from "@/components/ui/responsive-dialog";
import { Skeleton } from "@/components/ui/skeleton";
import { SpaceBadge } from "@/components/ui/space-badge";
import type { CategoryResponse, ContractResponse, MemberResponse, SourceResponse } from "@/lib/api";
import { listAllContracts } from "@/lib/contracts/client";
import { todayIso } from "@/lib/finance/common";
import { listCategories, listMembers } from "@/lib/finance/client";
import { listAllSources } from "@/lib/income/client";


/** Today as a calendar date, fixed for the life of the screen. */
export function useToday(): string {
  const [today] = React.useState(() => todayIso());
  return today;
}

/** A member's name for a picker or a row. Never the email address (finance.md 3.7). */
export function memberLabel(m: Pick<MemberResponse, "display_name">): string {
  return m.display_name?.trim() || "Member";
}

export interface ReferenceData {
  status: "loading" | "ready" | "error";
  categories: CategoryResponse[];
  members: MemberResponse[];
  /** Loaded only when asked for (the expense screens). */
  contracts: ContractResponse[];
  /** Loaded only when asked for (the income screens). */
  sources: SourceResponse[];
  retry: () => void;
}

type Loaded = Omit<ReferenceData, "retry">;
const EMPTY: Loaded = { status: "loading", categories: [], members: [], contracts: [], sources: [] };

/**
 * The categories (and, in a household, the members) of one space, for the pickers, the filters and
 * the names in rows. `include` adds the contracts or the income sources, or leaves the categories out. Mount it under a key of the
 * space id, so a switch of space starts again.
 */
export function useReferenceData(
  spaceId: string,
  household: boolean,
  include: { categories?: boolean; contracts?: boolean; sources?: boolean } = {},
): ReferenceData {
  const wantCategories = include.categories ?? true;
  const wantContracts = include.contracts ?? false;
  const wantSources = include.sources ?? false;
  const [state, setState] = React.useState<Loaded>(EMPTY);
  const [attempt, setAttempt] = React.useState(0);
  React.useEffect(() => {
    let live = true;
    Promise.all([
      wantCategories ? listCategories(spaceId) : Promise.resolve({ ok: true as const, data: { items: [] as CategoryResponse[] } }),
      household ? listMembers(spaceId) : Promise.resolve(null),
      wantContracts ? listAllContracts(spaceId) : Promise.resolve(null),
      wantSources ? listAllSources(spaceId) : Promise.resolve(null),
    ]).then(([cats, members, contracts, sources]) => {
      if (!live) return;
      if (!cats.ok || (members && !members.ok) || (contracts && !contracts.ok) || (sources && !sources.ok)) {
        setState({ ...EMPTY, status: "error" });
        return;
      }
      setState({
        status: "ready",
        categories: cats.data.items,
        members: members && members.ok ? members.data : [],
        contracts: contracts && contracts.ok ? contracts.data : [],
        sources: sources && sources.ok ? sources.data : [],
      });
    });
    return () => {
      live = false;
    };
  }, [spaceId, household, wantCategories, wantContracts, wantSources, attempt]);
  const retry = React.useCallback(() => {
    setState((s) => ({ ...s, status: "loading" }));
    setAttempt((n) => n + 1);
  }, []);
  return { ...state, retry };
}

// ---- Names in rows -----------------------------------------------------------------------------
// A name comes with the reference data. While it loads a row shows none (no fallback text that then
// changes); when it failed to load, a neutral label says so instead of leaving a blank.

type Status = ReferenceData["status"];

function named(status: Status, found: string | undefined, unavailable: string): string {
  if (status === "loading") return "";
  if (status === "error") return unavailable;
  return found ?? "";
}

export function categoryLabel(ref: Pick<ReferenceData, "status" | "categories">, key: string): string {
  return named(ref.status, ref.categories.find((c) => c.key === key)?.name ?? key, "Category unavailable");
}

/** "Jordan Kim" for a member's id, "" while loading, "Member unavailable" when the members failed to load. */
export function memberName(ref: Pick<ReferenceData, "status" | "members">, userId: string): string {
  const m = ref.members.find((x) => x.user_id === userId);
  return named(ref.status, memberLabel(m ?? { display_name: null }), "Member unavailable");
}

/** "For Jordan Kim" for a row in a household, or null (whole household, a personal space, still loading). */
export function forMemberText(
  ref: Pick<ReferenceData, "status" | "members">,
  household: boolean,
  userId: string | null,
): string | null {
  if (!household || !userId) return null;
  const name = memberName(ref, userId);
  return name === "" ? null : name === "Member unavailable" ? name : `For ${name}`;
}

export function contractLabel(ref: Pick<ReferenceData, "status" | "contracts">, id: string): string {
  return named(ref.status, ref.contracts.find((c) => c.id === id)?.name, "Contract unavailable");
}

export function sourceLabel(ref: Pick<ReferenceData, "status" | "sources">, id: string): string {
  return named(ref.status, ref.sources.find((s) => s.id === id)?.name, "Source unavailable");
}

// ---- Form body states --------------------------------------------------------------------------

/** What a form dialog shows while its reference data loads or failed; the form itself once it is ready. */
export function ReferenceGate({
  status,
  onRetry,
  children,
}: {
  status: Status;
  onRetry: () => void;
  children: React.ReactNode;
}) {
  if (status === "loading") {
    return (
      <div aria-busy="true" className="space-y-4" data-testid="form-loading">
        <p className="sr-only" role="status">
          Loading
        </p>
        <Skeleton className="h-11 w-full" />
        <Skeleton className="h-11 w-full" />
        <Skeleton className="h-11 w-full" />
      </div>
    );
  }
  if (status === "error") {
    return (
      <div>
        <FormMessage kind="error">We could not load the lists for this form just now.</FormMessage>
        <Button type="button" variant="outline" className="mt-3" onClick={onRetry}>
          Retry
        </Button>
      </div>
    );
  }
  return <>{children}</>;
}

/** The dialog a form shows until its reference data is ready (loading skeleton, or an error with Retry). */
export function PendingFormDialog({
  open,
  onOpenChange,
  title,
  status,
  onRetry,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  status: Status;
  onRetry: () => void;
}) {
  const space = useActiveSpace();
  return (
    <ResponsiveDialog
      open={open}
      onOpenChange={onOpenChange}
      title={title}
      headerExtra={<SpaceBadge type={space.type} label={space.name} />}
      footer={
        <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>
          Cancel
        </Button>
      }
    >
      <ReferenceGate status={status} onRetry={onRetry}>
        {null}
      </ReferenceGate>
    </ResponsiveDialog>
  );
}

/** The text button that deletes a record, below a divider in the footer of an edit dialog (finance.md 3.11). */
export function DeleteButton({ label, onClick, disabled }: { label: string; onClick: () => void; disabled?: boolean }) {
  return (
    <div className="mt-1 border-t border-border pt-3 md:mr-auto md:mt-0 md:border-t-0 md:pt-0">
      <Button type="button" variant="ghost" className="w-full text-destructive hover:text-destructive md:w-auto" disabled={disabled} onClick={onClick} data-testid="delete-record">
        {label}
      </Button>
    </div>
  );
}

/** Skeleton cards on phone and rows from md up, with the same heights as the content (finance.md 5.1). */
export function ListSkeleton({ label, testId, cardClass = "h-28" }: { label: string; testId: string; cardClass?: string }) {
  return (
    <div aria-busy="true" data-testid={testId}>
      <p className="sr-only" role="status">
        {label}
      </p>
      <div className="space-y-3 md:hidden">
        {[0, 1, 2].map((i) => (
          <Skeleton key={i} className={`${cardClass} w-full`} />
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

/** A record's amount for a row or card, in its stored currency. `signDisplay="always"` for income (finance.md 3.2). */
export function RecordAmount({
  amount,
  currency,
  signDisplay,
}: {
  amount: string;
  currency: string;
  signDisplay?: "always";
}) {
  return (
    <span className="inline-flex shrink-0 flex-col items-end whitespace-nowrap text-right">
      <MoneyText amount={amount} currency={currency} signDisplay={signDisplay} size="md" />
    </span>
  );
}
