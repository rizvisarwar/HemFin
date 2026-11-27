"use client";

import * as React from "react";
import { useActiveSpace } from "@/components/layout/app-shell-client";
import { AmountInput } from "@/components/ui/amount-input";
import { AppliesToSelect } from "@/components/ui/applies-to-select";
import { Button } from "@/components/ui/button";
import { CategorySelect } from "@/components/ui/category-select";
import { CheckboxRow } from "@/components/ui/checkbox-row";
import { Field, FieldError } from "@/components/ui/field";
import { FormMessage } from "@/components/ui/form-message";
import { FormSection } from "@/components/ui/form-section";
import { FrequencySelect } from "@/components/ui/frequency-select";
import { Label } from "@/components/ui/label";
import { ResponsiveDialog } from "@/components/ui/responsive-dialog";
import { Skeleton } from "@/components/ui/skeleton";
import { SpaceBadge } from "@/components/ui/space-badge";
import { Textarea } from "@/components/ui/textarea";
import type { CategoryResponse, ContractResponse, MemberResponse } from "@/lib/api";
import { createContract, updateContract } from "@/lib/contracts/client";
import { amountToInput } from "@/lib/finance/amount";
import {
  NAME_MAX,
  NOTES_MAX,
  validateContract,
  type ContractFormField,
  type ContractFormValues,
} from "@/lib/contracts/contracts";
import { categoryGroups, todayIso } from "@/lib/finance/common";
import { memberLabel } from "@/components/finance/finance-parts";
import { useFormState } from "@/components/finance/use-form-state";
import { DiscardDialog } from "@/components/ui/discard-dialog";

const FIELDS: ContractFormField[] = [
  "name", "provider", "category_id", "amount", "frequency", "start_date", "end_date",
  "auto_renew", "renewal_term_months", "notice_period_days", "member_user_id", "notes",
];

export interface ContractFormDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  spaceId: string;
  /** The contract being edited, or null to add one. */
  contract: ContractResponse | null;
  /** Whether the categories (and members) are loaded. The form waits for them. */
  referenceStatus: "loading" | "ready" | "error";
  onRetryReference: () => void;
  categories: CategoryResponse[];
  members: MemberResponse[];
  /** Called with the saved contract once the API accepted it. */
  onSaved: (contract: ContractResponse) => void;
}

/**
 * Add or edit a contract in a dialog (a bottom sheet on phone), finance.md 4.3. Mount it under a new
 * `key` each time it opens, so the fields start from the contract (or the defaults). Field names equal the
 * API's, so a server error lands under its field.
 */
export function ContractFormDialog(props: ContractFormDialogProps) {
  const { open, onOpenChange, contract, referenceStatus, onRetryReference, categories, members } = props;
  const space = useActiveSpace();
  const household = space.type === "household";

  const f = useFormState<ContractFormValues>(() => initialValues(contract), FIELDS, "contract-form");
  const { values, errors, formError, busy, discard } = f;

  const groups = React.useMemo(() => categoryGroups(categories, "id"), [categories]);
  const set = f.set;

  /** Validate on blur: only the field that was left shows its message. */
  function blur(field: ContractFormField) {
    f.blur(field, validateContract(values).errors);
  }

  const requestClose = () => f.requestClose(() => onOpenChange(false));

  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (busy) return;
    const result = validateContract(values);
    if (!result.payload) return f.invalid(result.errors);
    f.setErrors({});
    f.setFormError(undefined);
    f.setBusy(true);
    const res = contract
      ? await updateContract(props.spaceId, contract.id, result.payload)
      : await createContract(props.spaceId, result.payload);
    f.setBusy(false);
    if (res.ok) return props.onSaved(res.data);
    f.refused(res.problem);
  }

  return (
    <ResponsiveDialog
      open={open}
      onOpenChange={(next) => (next ? onOpenChange(true) : requestClose())}
      busy={busy}
      className="md:max-w-lg"
      title={contract ? "Edit contract" : "Add a contract"}
      headerExtra={<SpaceBadge type={space.type} label={space.name} />}
      footer={
        <>
          <Button
            type="submit"
            form="contract-form"
            disabled={busy || referenceStatus !== "ready"}
            aria-busy={busy || undefined}
            data-testid="save-contract"
          >
            {busy ? "Saving…" : "Save contract"}
          </Button>
          <Button type="button" variant="ghost" onClick={requestClose} disabled={busy}>
            Cancel
          </Button>
        </>
      }
    >
      {referenceStatus === "loading" ? (
        <div aria-busy="true" className="space-y-4" data-testid="contract-form-loading">
          <p className="sr-only" role="status">
            Loading
          </p>
          <Skeleton className="h-11 w-full" />
          <Skeleton className="h-11 w-full" />
          <Skeleton className="h-11 w-full" />
        </div>
      ) : referenceStatus === "error" ? (
        <div>
          <FormMessage kind="error">We could not load the categories just now.</FormMessage>
          <Button type="button" variant="outline" className="mt-3" onClick={onRetryReference}>
            Retry
          </Button>
        </div>
      ) : (
        <form
          id="contract-form"
          method="post"
          noValidate
          onSubmit={submit}
          aria-busy={busy || undefined}
          className="space-y-6"
          data-testid="contract-form"
        >
          <FormMessage kind="error">{formError}</FormMessage>

          <FormSection title="About">
            <Field
              id="name"
              label="Name"
              value={values.name}
              maxLength={NAME_MAX}
              autoComplete="off"
              autoFocus
              aria-required="true"
              error={errors.name}
              onChange={(e) => set("name", e.target.value)}
              onBlur={() => blur("name")}
            />
            <Field
              id="provider"
              label="Provider (optional)"
              value={values.provider}
              maxLength={NAME_MAX}
              autoComplete="off"
              error={errors.provider}
              onChange={(e) => set("provider", e.target.value)}
            />
            <CategorySelect
              id="category_id"
              name="category_id"
              label="Category"
              groups={groups}
              value={values.category_id}
              onValueChange={(v) => set("category_id", v)}
              emptyLabel="Choose a category"
              emptyDisabled
              required
              error={errors.category_id}
            />
          </FormSection>

          <FormSection title="Cost">
            <AmountInput
              id="amount"
              name="amount"
              label="Amount"
              value={values.amount}
              onValueChange={(v) => set("amount", v)}
              onBlur={() => blur("amount")}
              required
              error={errors.amount}
            />
            <FrequencySelect
              id="frequency"
              label="Billed"
              value={values.frequency}
              onValueChange={(v) => set("frequency", v as ContractFormValues["frequency"])}
              required
              error={errors.frequency}
            />
          </FormSection>

          <FormSection title="Dates">
            <div className="grid gap-4 md:grid-cols-2">
              <Field
                id="start_date"
                type="date"
                label="Starts"
                value={values.start_date}
                aria-required="true"
                error={errors.start_date}
                onChange={(e) => set("start_date", e.target.value)}
                onBlur={() => blur("start_date")}
              />
              <Field
                id="end_date"
                type="date"
                label="Ends (optional)"
                value={values.end_date}
                error={errors.end_date}
                onChange={(e) => set("end_date", e.target.value)}
                onBlur={() => blur("end_date")}
              />
            </div>
            <p className="-mt-2 text-small text-muted-foreground">Leave empty if it runs until you cancel it.</p>
          </FormSection>

          <FormSection title="Renewal">
            <CheckboxRow
              id="auto_renew"
              name="auto_renew"
              label="Renews automatically"
              description="It carries on after the end date."
              checked={values.auto_renew}
              onCheckedChange={(c) => set("auto_renew", c)}
            />
            <div className="grid gap-4 md:grid-cols-2">
              {values.auto_renew ? (
                <Field
                  id="renewal_term_months"
                  label="Renews every (months)"
                  inputMode="numeric"
                  autoComplete="off"
                  value={values.renewal_term_months}
                  aria-required="true"
                  error={errors.renewal_term_months}
                  onChange={(e) => set("renewal_term_months", e.target.value)}
                  onBlur={() => blur("renewal_term_months")}
                />
              ) : null}
              <Field
                id="notice_period_days"
                label="Notice period (days, optional)"
                inputMode="numeric"
                autoComplete="off"
                value={values.notice_period_days}
                hint="How many days before renewal you must give notice. Leave empty if there is none."
                error={errors.notice_period_days}
                onChange={(e) => set("notice_period_days", e.target.value)}
                onBlur={() => blur("notice_period_days")}
              />
            </div>
          </FormSection>

          {household ? (
            <AppliesToSelect
              id="member_user_id"
              label="Applies to (optional)"
              options={members.map((m) => ({ value: m.user_id, label: memberLabel(m) }))}
              value={values.member_user_id}
              onValueChange={(v) => set("member_user_id", v)}
              error={errors.member_user_id}
            />
          ) : null}

          <div className="space-y-2">
            <Label htmlFor="notes" className="text-body">
              Notes (optional)
            </Label>
            <Textarea
              id="notes"
              name="notes"
              value={values.notes}
              maxLength={NOTES_MAX}
              aria-invalid={errors.notes ? true : undefined}
              aria-describedby={errors.notes ? "notes-error" : undefined}
              onChange={(e) => set("notes", e.target.value)}
            />
            <FieldError id="notes-error" error={errors.notes} />
          </div>
        </form>
      )}

      <DiscardDialog
        open={discard}
        onOpenChange={f.setDiscard}
        description="Your changes to this contract are not saved."
        onDiscard={() => {
          f.setDiscard(false);
          onOpenChange(false);
        }}
      />
    </ResponsiveDialog>
  );
}

function initialValues(c: ContractResponse | null): ContractFormValues {
  if (!c) {
    return {
      name: "",
      provider: "",
      category_id: "",
      amount: "",
      frequency: "monthly",
      start_date: todayIso(),
      end_date: "",
      auto_renew: false,
      renewal_term_months: "12",
      notice_period_days: "",
      member_user_id: "",
      notes: "",
    };
  }
  return {
    name: c.name,
    provider: c.provider ?? "",
    category_id: c.category_id,
    amount: amountToInput(c.amount),
    frequency: c.frequency as ContractFormValues["frequency"],
    start_date: c.start_date,
    end_date: c.end_date ?? "",
    auto_renew: c.auto_renew,
    renewal_term_months: String(c.renewal_term_months ?? 12),
    notice_period_days: c.notice_period_days === null ? "" : String(c.notice_period_days),
    member_user_id: c.member_user_id ?? "",
    notes: c.notes ?? "",
  };
}
