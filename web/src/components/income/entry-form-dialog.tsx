"use client";

import * as React from "react";
import { useFormat } from "@/components/format-provider";
import { useActiveSpace } from "@/components/layout/app-shell-client";
import { CURRENCY_OPTIONS, DeleteButton, memberLabel, PendingFormDialog, useToday, type ReferenceData } from "@/components/finance/finance-parts";
import { useFormState } from "@/components/finance/use-form-state";
import { AmountInput } from "@/components/ui/amount-input";
import { AppliesToSelect } from "@/components/ui/applies-to-select";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { DiscardDialog } from "@/components/ui/discard-dialog";
import { Field } from "@/components/ui/field";
import { FormMessage } from "@/components/ui/form-message";
import { ResponsiveDialog } from "@/components/ui/responsive-dialog";
import { SelectField } from "@/components/ui/select-field";
import { SpaceBadge } from "@/components/ui/space-badge";
import type { IncomeEntryResponse } from "@/lib/api";
import { amountToInput, decimalMark, fractionDigits } from "@/lib/finance/amount";
import { DESCRIPTION_MAX, todayIso } from "@/lib/finance/common";
import { createEntry, deleteEntry, updateEntry } from "@/lib/income/client";
import { sourceOptionLabel, validateEntry, type EntryFormField, type EntryFormValues } from "@/lib/income/income";

const FIELDS: EntryFormField[] = ["amount", "currency", "received_on", "source_id", "description", "member_user_id"];
const FORM_ID = "entry-form";

export interface EntryFormDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  spaceId: string;
  /** The entry being edited, or null to add one. */
  entry: IncomeEntryResponse | null;
  /** The members and the income sources. The form waits for them. */
  reference: ReferenceData;
  onSaved: (entry: IncomeEntryResponse) => void;
  onDeleted: () => void;
  /** Where focus goes when the dialog closes: an element, or null for the default (back to what opened it). */
  finalFocus?: () => HTMLElement | null;
}

/** Add or edit a received payment in a dialog (finance.md 6.2). Mount it under a new `key` each time it opens. */
export function EntryFormDialog(props: EntryFormDialogProps) {
  const { reference } = props;
  if (reference.status !== "ready") {
    return (
      <PendingFormDialog
        open={props.open}
        onOpenChange={props.onOpenChange}
        title={props.entry ? "Edit income" : "Add income"}
        status={reference.status}
        onRetry={reference.retry}
      />
    );
  }
  return <LoadedEntryForm {...props} />;
}

function LoadedEntryForm({ open, onOpenChange, spaceId, entry, reference, onSaved, onDeleted, finalFocus }: EntryFormDialogProps) {
  const space = useActiveSpace();
  const household = space.type === "household";
  const { prefs, calendarDate, money } = useFormat();
  const mark = decimalMark(prefs.locale);
  const today = useToday();

  const f = useFormState<EntryFormValues>(() => initialValues(entry, prefs.currency, prefs.locale), FIELDS, FORM_ID);
  const { values, errors, formError, busy, discard, set } = f;
  const [ask, setAsk] = React.useState(false);
  const digits = fractionDigits(values.currency, prefs.locale);
  const editing = entry !== null;

  function blur(field: EntryFormField) {
    f.blur(field, validateEntry(values, { mark, digits, today }).errors);
  }

  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (busy) return;
    const result = validateEntry(values, { mark, digits, today });
    if (!result.payload) return f.invalid(result.errors);
    f.setErrors({});
    f.setFormError(undefined);
    f.setBusy(true);
    const res = entry ? await updateEntry(spaceId, entry.id, result.payload) : await createEntry(spaceId, result.payload);
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
      initialFocus={() => document.getElementById("amount")}
      finalFocus={finalFocus}
      title={editing ? "Edit income" : "Add income"}
      headerExtra={<SpaceBadge type={space.type} label={space.name} />}
      footer={
        <>
          <Button type="submit" form={FORM_ID} disabled={busy} aria-busy={busy || undefined} data-testid="save-entry">
            {busy ? "Saving…" : "Save income"}
          </Button>
          <Button type="button" variant="ghost" onClick={requestClose} disabled={busy}>
            Cancel
          </Button>
          {editing ? <DeleteButton label="Delete income" disabled={busy} onClick={() => setAsk(true)} /> : null}
        </>
      }
    >
      <form id={FORM_ID} method="post" noValidate onSubmit={submit} aria-busy={busy || undefined} className="space-y-4" data-testid={FORM_ID}>
        <FormMessage kind="error">{formError}</FormMessage>

        <AmountInput
          id="amount"
          name="amount"
          label="Amount"
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
        <Field
          id="received_on"
          type="date"
          label="Received on"
          value={values.received_on}
          aria-required="true"
          error={errors.received_on}
          onChange={(e) => set("received_on", e.target.value)}
          onBlur={() => blur("received_on")}
        />
        <SelectField
          id="source_id"
          label="From source (optional)"
          value={values.source_id}
          onValueChange={(v) => set("source_id", v)}
          options={reference.sources.map((s) => ({ value: s.id, label: sourceOptionLabel(s) }))}
          emptyLabel="No source"
          error={errors.source_id}
        />
        <Field
          id="description"
          label="Description (optional)"
          value={values.description}
          maxLength={DESCRIPTION_MAX}
          autoComplete="off"
          error={errors.description}
          onChange={(e) => set("description", e.target.value)}
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
      </form>

      {entry ? (
        <ConfirmDialog
          open={ask}
          onOpenChange={setAsk}
          title="Delete this income?"
          description={`${money(entry.amount, { currency: entry.currency, code: entry.currency !== prefs.currency })} from ${calendarDate(entry.received_on)}. It cannot be undone.`}
          confirmLabel="Delete income"
          busyLabel="Deleting…"
          dismissLabel="Keep income"
          destructive
          onConfirm={async () => {
            const res = await deleteEntry(spaceId, entry.id);
            if (!res.ok) return res.problem.form ?? "We could not delete this income. Try again.";
            onDeleted();
            return undefined;
          }}
        />
      ) : null}

      <DiscardDialog
        open={discard}
        onOpenChange={f.setDiscard}
        description="Your changes to this income are not saved."
        onDiscard={() => {
          f.setDiscard(false);
          onOpenChange(false);
        }}
      />
    </ResponsiveDialog>
  );
}

function initialValues(e: IncomeEntryResponse | null, baseCurrency: string, locale: string): EntryFormValues {
  if (!e) return { amount: "", currency: baseCurrency, received_on: todayIso(), source_id: "", description: "", member_user_id: "" };
  return {
    amount: amountToInput(e.amount, { mark: decimalMark(locale), digits: fractionDigits(e.currency, locale) }),
    currency: e.currency,
    received_on: e.received_on,
    source_id: e.source_id ?? "",
    description: e.description ?? "",
    member_user_id: e.member_user_id ?? "",
  };
}
