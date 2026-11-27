"use client";

import * as React from "react";
import { useFormat } from "@/components/format-provider";
import { DueChip } from "@/components/ui/due-chip";
import { FREQUENCY_PHRASE } from "@/components/ui/frequency-select";
import { MoneyText } from "@/components/ui/money-text";
import { cn } from "@/lib/utils";
import type { ContractResponse } from "@/lib/api";
import { noticeChip, paymentChip, renewalChip, type Chip } from "@/lib/contracts/contracts";

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
