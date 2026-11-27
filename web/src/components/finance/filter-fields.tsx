"use client";

import { memberLabel } from "@/components/finance/finance-parts";
import { Field } from "@/components/ui/field";
import { Label } from "@/components/ui/label";
import { NativeSelect } from "@/components/ui/native-select";
import { rangeError } from "@/lib/finance/common";
import type { MemberResponse } from "@/lib/api";

/** From and To (inclusive), side by side from md. The message sits under To (finance.md 3.6). */
export function DateRangeFields({
  prefix,
  from,
  to,
  onChange,
}: {
  prefix: string;
  from: string;
  to: string;
  onChange: (next: { from: string; to: string }) => void;
}) {
  const error = rangeError(from, to);
  return (
    <>
      <Field id={`${prefix}-from`} type="date" label="From" value={from} onChange={(e) => onChange({ from: e.target.value, to })} />
      <Field id={`${prefix}-to`} type="date" label="To" value={to} error={error} onChange={(e) => onChange({ from, to: e.target.value })} />
    </>
  );
}

/** The "Applies to" filter (household only): All, Whole household or one member (finance.md 4.1). Not `AppliesToSelect`, whose "" means the household. */
export function AppliesFilter({
  prefix,
  value,
  onChange,
  members,
}: {
  prefix: string;
  value: string;
  onChange: (next: string) => void;
  members: Pick<MemberResponse, "user_id" | "display_name">[];
}) {
  return (
    <div className="space-y-2">
      <Label htmlFor={`${prefix}-applies`} className="text-body">
        Applies to
      </Label>
      <NativeSelect id={`${prefix}-applies`} value={value} onChange={(e) => onChange(e.target.value)}>
        <option value="all">All</option>
        <option value="household">Whole household</option>
        {members.map((m) => (
          <option key={m.user_id} value={m.user_id}>
            {memberLabel(m)}
          </option>
        ))}
      </NativeSelect>
    </div>
  );
}
