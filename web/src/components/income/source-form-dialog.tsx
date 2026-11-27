"use client";

import * as React from "react";
import { useFormat } from "@/components/format-provider";
import { useActiveSpace } from "@/components/layout/app-shell-client";
import { CURRENCY_OPTIONS, DeleteButton, memberLabel, PendingFormDialog, type ReferenceData } from "@/components/finance/finance-parts";
import { useFormState } from "@/components/finance/use-form-state";
import { AmountInput } from "@/components/ui/amount-input";
import { AppliesToSelect } from "@/components/ui/applies-to-select";
import { Button } from "@/components/ui/button";
import { CheckboxRow } from "@/components/ui/checkbox-row";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { DiscardDialog } from "@/components/ui/discard-dialog";
import { Field } from "@/components/ui/field";
import { FormMessage } from "@/components/ui/form-message";
import { FrequencySelect } from "@/components/ui/frequency-select";
import { ResponsiveDialog } from "@/components/ui/responsive-dialog";
import { SelectField } from "@/components/ui/select-field";
import { SpaceBadge } from "@/components/ui/space-badge";
import type { SourceResponse } from "@/lib/api";
import { amountToInput, decimalMark, fractionDigits } from "@/lib/finance/amount";
import { createSource, deleteSource, updateSource } from "@/lib/income/client";
import {
  SOURCE_NAME_MAX,
  SOURCE_TYPE_LABEL,
  validateSource,
  type SourceFormField,
  type SourceFormValues,
  type SourceType,
} from "@/lib/income/income";

const FIELDS: SourceFormField[] = ["name", "type", "amount", "currency", "frequency", "member_user_id", "active"];
const FORM_ID = "source-form";
const TYPE_OPTIONS = (Object.keys(SOURCE_TYPE_LABEL) as SourceType[]).map((t) => ({ value: t, label: SOURCE_TYPE_LABEL[t] }));

export interface SourceFormDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  spaceId: string;
  /** The source being edited, or null to add one. */
  source: SourceResponse | null;
  /** The members (household only). The form waits for them. */
  reference: ReferenceData;
  onSaved: (source: SourceResponse) => void;
  onDeleted: () => void;
  /** Where focus goes when the dialog closes: an element, or null for the default (back to what opened it). */
  finalFocus?: () => HTMLElement | null;
}

/** Add or edit an income source in a dialog (finance.md 6.3). Mount it under a new `key` each time it opens. */
export function SourceFormDialog(props: SourceFormDialogProps) {
  const { reference } = props;
  if (reference.status !== "ready") {
    return (
      <PendingFormDialog
        open={props.open}
        onOpenChange={props.onOpenChange}
        title={props.source ? "Edit source" : "Add a source"}
        status={reference.status}
        onRetry={reference.retry}
      />
    );
  }
  return <LoadedSourceForm {...props} />;
}

function LoadedSourceForm({ open, onOpenChange, spaceId, source, reference, onSaved, onDeleted, finalFocus }: SourceFormDialogProps) {
  const space = useActiveSpace();
  const household = space.type === "household";
  const { prefs } = useFormat();
  const mark = decimalMark(prefs.locale);

  const f = useFormState<SourceFormValues>(() => initialValues(source, prefs.currency, prefs.locale), FIELDS, FORM_ID);
  const { values, errors, formError, busy, discard, set } = f;
  const [ask, setAsk] = React.useState(false);
  const digits = fractionDigits(values.currency, prefs.locale);
  const editing = source !== null;

  function blur(field: SourceFormField) {
    f.blur(field, validateSource(values, { mark, digits }).errors);
  }

  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (busy) return;
    const result = validateSource(values, { mark, digits });
    if (!result.payload) return f.invalid(result.errors);
    f.setErrors({});
    f.setFormError(undefined);
    f.setBusy(true);
    const res = source ? await updateSource(spaceId, source.id, result.payload) : await createSource(spaceId, result.payload);
    f.setBusy(false);
    if (res.ok) return onSaved(res.data);
    f.refused(res.problem);
  }

  const requestClose = () => f.requestClose(() => onOpenChange(false));

  return (
    <ResponsiveDialog
      open={open}
      onOpenChange={(next) => (next ? onOpenChange(true) : requestClose())}
      busy={busy}
      initialFocus={() => document.getElementById("name")}
      finalFocus={finalFocus}
      title={editing ? "Edit source" : "Add a source"}
      headerExtra={<SpaceBadge type={space.type} label={space.name} />}
      footer={
        <>
          <Button type="submit" form={FORM_ID} disabled={busy} aria-busy={busy || undefined} data-testid="save-source">
            {busy ? "Saving…" : "Save source"}
          </Button>
          <Button type="button" variant="ghost" onClick={requestClose} disabled={busy}>
            Cancel
          </Button>
          {editing ? <DeleteButton label="Delete source" disabled={busy} onClick={() => setAsk(true)} /> : null}
        </>
      }
    >
      <form id={FORM_ID} method="post" noValidate onSubmit={submit} aria-busy={busy || undefined} className="space-y-4" data-testid={FORM_ID}>
        <FormMessage kind="error">{formError}</FormMessage>

        <Field
          id="name"
          label="Name"
          value={values.name}
          maxLength={SOURCE_NAME_MAX}
          autoComplete="off"
          aria-required="true"
          error={errors.name}
          onChange={(e) => set("name", e.target.value)}
          onBlur={() => blur("name")}
        />
        <SelectField
          id="type"
          label="Type"
          value={values.type}
          onValueChange={(v) => set("type", v as SourceType)}
          options={TYPE_OPTIONS}
          error={errors.type}
        />
        <AmountInput
          id="amount"
          name="amount"
          label={values.frequency === "irregular" ? "Typical amount" : "Amount"}
          value={values.amount}
          onValueChange={(v) => set("amount", v)}
          onBlur={() => blur("amount")}
          currency={values.currency}
          currencyOptions={CURRENCY_OPTIONS}
          onCurrencyChange={(c) => set("currency", c)}
          decimalSeparator={mark}
          fractionDigits={digits}
          required
          error={errors.amount}
          currencyError={errors.currency}
        />
        <FrequencySelect
          id="frequency"
          label="How often"
          value={values.frequency}
          onValueChange={(v) => set("frequency", v)}
          includeIrregular
          required
          error={errors.frequency}
        />
        {household ? (
          <AppliesToSelect
            id="member_user_id"
            label="Applies to (optional)"
            options={reference.members.map((m) => ({ value: m.user_id, label: memberLabel(m) }))}
            value={values.member_user_id}
            onValueChange={(v) => set("member_user_id", v)}
            error={errors.member_user_id}
          />
        ) : null}
        <CheckboxRow
          id="active"
          name="active"
          label="Active"
          description="Turn off to pause this source. Its payments stay in your list."
          checked={values.active}
          onCheckedChange={(c) => set("active", c)}
        />
      </form>

      {source ? (
        <ConfirmDialog
          open={ask}
          onOpenChange={setAsk}
          title={`Delete ${source.name}?`}
          description="Its received payments stay in your list, but they are no longer linked to this source. It cannot be undone."
          confirmLabel="Delete source"
          busyLabel="Deleting…"
          dismissLabel="Keep source"
          destructive
          onConfirm={async () => {
            const res = await deleteSource(spaceId, source.id);
            if (!res.ok) return res.problem.form ?? "We could not delete this source. Try again.";
            onDeleted();
            return undefined;
          }}
        />
      ) : null}

      <DiscardDialog
        open={discard}
        onOpenChange={f.setDiscard}
        description="Your changes to this source are not saved."
        onDiscard={() => {
          f.setDiscard(false);
          onOpenChange(false);
        }}
      />
    </ResponsiveDialog>
  );
}

function initialValues(s: SourceResponse | null, baseCurrency: string, locale: string): SourceFormValues {
  if (!s) return { name: "", type: "salary", amount: "", currency: baseCurrency, frequency: "monthly", member_user_id: "", active: true };
  return {
    name: s.name,
    type: s.type as SourceType,
    amount: amountToInput(s.amount, { mark: decimalMark(locale), digits: fractionDigits(s.currency, locale) }),
    currency: s.currency,
    frequency: s.frequency as SourceFormValues["frequency"],
    member_user_id: s.member_user_id ?? "",
    active: s.active,
  };
}
