"use client";

import * as React from "react";
import { useFormat } from "@/components/format-provider";
import { DueChip } from "@/components/ui/due-chip";
import { FREQUENCY_PHRASE } from "@/components/ui/frequency-select";
import { MoneyText } from "@/components/ui/money-text";
import { cn } from "@/lib/utils";
import type { CategoryResponse, ContractResponse, MemberResponse } from "@/lib/api";
import { listCategories, listMembers } from "@/lib/contracts/client";
import { noticeChip, paymentChip, renewalChip, todayIso, type Chip } from "@/lib/contracts/contracts";

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
  retry: () => void;
}

/**
 * The categories (and, in a household, the members) of one space, for the pickers, the filters and
 * the names in rows. Mount it under a key of the space id, so a switch of space starts again.
 */
export function useReferenceData(spaceId: string, household: boolean): ReferenceData {
  const [state, setState] = React.useState<Omit<ReferenceData, "retry">>({ status: "loading", categories: [], members: [] });
  const [attempt, setAttempt] = React.useState(0);
  React.useEffect(() => {
    let live = true;
    Promise.all([listCategories(spaceId), household ? listMembers(spaceId) : Promise.resolve(null)]).then(([cats, members]) => {
      if (!live) return;
      if (!cats.ok || (members && !members.ok)) setState({ status: "error", categories: [], members: [] });
      else setState({ status: "ready", categories: cats.data.items, members: members && members.ok ? members.data : [] });
    });
    return () => {
      live = false;
    };
  }, [spaceId, household, attempt]);
  const retry = React.useCallback(() => {
    setState((s) => ({ ...s, status: "loading" }));
    setAttempt((n) => n + 1);
  }, []);
  return { ...state, retry };
}

export function categoryName(categories: CategoryResponse[], key: string): string {
  return categories.find((c) => c.key === key)?.name ?? key;
}

/** "EUR 4,350.00 a year": the amount in its own currency (a code when it is not the base currency) and the frequency in words. */
export function ContractAmount({ contract, align = "right" }: { contract: ContractResponse; align?: "left" | "right" }) {
  const { prefs } = useFormat();
  return (
    <span className={cn("inline-flex shrink-0 flex-col whitespace-nowrap", align === "right" ? "items-end text-right" : "items-start")}>
      <MoneyText
        amount={contract.amount}
        currency={contract.currency}
        locale={prefs.locale}
        showCode={contract.currency !== prefs.currency}
        size="md"
      />
      <span className="text-small text-muted-foreground">{FREQUENCY_PHRASE[contract.frequency]}</span>
    </span>
  );
}

/** The warning chips for what is close: a payment or renewal within 7 days, a notice deadline within 30. */
export function soonChips(contract: ContractResponse, today: string): Chip[] {
  const s = contract.schedule;
  return [paymentChip(s.next_payment_date, today), renewalChip(s.renewal_date, today), noticeChip(s.notice_deadline, today)].filter(
    (c): c is Chip => c !== null,
  );
}

export function SoonChips({ chips: all, className }: { chips: (Chip | null)[]; className?: string }) {
  const chips = all.filter((c): c is Chip => c !== null);
  if (chips.length === 0) return null;
  return (
    <div className={cn("flex flex-wrap gap-2", className)}>
      {chips.map((c) => (
        <DueChip key={c.key} tone="soon">
          {c.text}
        </DueChip>
      ))}
    </div>
  );
}
