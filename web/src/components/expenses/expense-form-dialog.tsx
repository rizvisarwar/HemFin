"use client";

import * as React from "react";
import { ChevronDown } from "lucide-react";
import { useFormat } from "@/components/format-provider";
import { useActiveSpace } from "@/components/layout/app-shell-client";
import { categoryLabel, CURRENCY_OPTIONS, DeleteButton, memberLabel, PendingFormDialog, useToday, type ReferenceData } from "@/components/finance/finance-parts";
import { useFormState } from "@/components/finance/use-form-state";
import { AmountInput } from "@/components/ui/amount-input";
import { AppliesToSelect } from "@/components/ui/applies-to-select";
import { Button } from "@/components/ui/button";
import { CategorySelect } from "@/components/ui/category-select";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { DiscardDialog } from "@/components/ui/discard-dialog";
import { Field } from "@/components/ui/field";
import { FormMessage } from "@/components/ui/form-message";
import { ResponsiveDialog } from "@/components/ui/responsive-dialog";
import { SelectField } from "@/components/ui/select-field";
import { SpaceBadge } from "@/components/ui/space-badge";
import { cn } from "@/lib/utils";
import type { ExpenseResponse } from "@/lib/api";
import { createExpense, deleteExpense, updateExpense } from "@/lib/expenses/client";
import {
  DESCRIPTION_MAX,
  MERCHANT_MAX,
  readLastCategory,
  validateExpense,
  writeLastCategory,
  type ExpenseFormField,
  type ExpenseFormValues,
} from "@/lib/expenses/expenses";
import { amountToInput, decimalMark, fractionDigits } from "@/lib/finance/amount";
import { categoryGroups, todayIso } from "@/lib/finance/common";

const FIELDS: ExpenseFormField[] = ["amount", "currency", "category_id", "spent_on", "description", "merchant", "contract_id", "member_user_id"];
const FORM_ID = "expense-form";

export interface ExpenseFormDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  spaceId: string;
  /** The expense being edited, or null to add one. */
  expense: ExpenseResponse | null;
  /** The categories, members and contracts. The form waits for them. */
  reference: ReferenceData;
  /** The API accepted it. `again` is true for "Save and add another": the dialog stays open. */
  onSaved: (expense: ExpenseResponse, again: boolean) => void;
  onDeleted: () => void;
  /** Where focus goes when the dialog closes: an element, or null for the default (back to what opened it). */
  finalFocus?: () => HTMLElement | null;
}

/**
 * Quick add and edit for an expense, in a dialog (a bottom sheet on phone), finance.md 5.2 and 5.3.
 * Mount it under a new `key` each time it opens, so the fields start from the expense (or the defaults).
 */
export function ExpenseFormDialog(props: ExpenseFormDialogProps) {
  const { reference } = props;
  if (reference.status !== "ready") {
    return (
      <PendingFormDialog
        open={props.open}
        onOpenChange={props.onOpenChange}
        title={props.expense ? "Edit expense" : "Add an expense"}
        status={reference.status}
        onRetry={reference.retry}
      />
    );
  }
  return <LoadedExpenseForm {...props} />;
}

function LoadedExpenseForm({ open, onOpenChange, spaceId, expense, reference, onSaved, onDeleted, finalFocus }: ExpenseFormDialogProps) {
  const space = useActiveSpace();
  const household = space.type === "household";
  const { prefs, calendarDate, money } = useFormat();
  const mark = decimalMark(prefs.locale);
  const groups = React.useMemo(() => categoryGroups(reference.categories, "id"), [reference.categories]);

  const f = useFormState<ExpenseFormValues>(
    () => initialValues(expense, prefs.currency, prefs.locale, spaceId, reference),
    FIELDS,
    FORM_ID,
  );
  const { values, errors, formError, busy, discard, set } = f;
  const [which, setWhich] = React.useState<"save" | "again">("save");
  const [details, setDetails] = React.useState(expense !== null);
  const [ask, setAsk] = React.useState(false);
  const digits = fractionDigits(values.currency, prefs.locale);
  const today = useToday();
  const editing = expense !== null;

  const contractOptions = reference.contracts
    .filter((c) => c.status === "active" || c.id === values.contract_id)
    .map((c) => ({ value: c.id, label: c.status === "active" ? c.name : `${c.name} (cancelled)` }));

  function blur(field: ExpenseFormField) {
    f.blur(field, validateExpense(values, { mark, digits, today }).errors);
  }

  async function save(again: boolean) {
    if (busy) return;
    const result = validateExpense(values, { mark, digits, today });
    if (!result.payload) return f.invalid(result.errors);
    f.setErrors({});
    f.setFormError(undefined);
    setWhich(again ? "again" : "save");
    f.setBusy(true);
    const res = expense ? await updateExpense(spaceId, expense.id, result.payload) : await createExpense(spaceId, result.payload);
    f.setBusy(false);
    if (!res.ok) {
      if (Object.keys(res.problem.fields).some((k) => k === "contract_id" || k === "member_user_id" || k === "description" || k === "merchant")) setDetails(true);
      return f.refused(res.problem);
    }
    writeLastCategory(spaceId, result.payload.category_id);
    if (again) {
      // Keep the category, date, currency and who it applies to; start the next one empty and ready to type.
      f.setValues((v) => ({ ...v, amount: "", description: "", merchant: "", contract_id: "" }));
      requestAnimationFrame(() => document.getElementById("amount")?.focus());
    }
    onSaved(res.data, again);
  }

  const requestClose = () => f.requestClose(() => onOpenChange(false));
  const confirmText = expense
    ? `${expense.description?.trim() || categoryLabel(reference, expense.category)}, ${money(expense.amount, { currency: expense.currency, code: expense.currency !== prefs.currency })}, ${calendarDate(expense.spent_on)}. It cannot be undone.`
    : "";

  return (
    <ResponsiveDialog
      open={open}
      onOpenChange={(next) => (next ? onOpenChange(true) : requestClose())}
      busy={busy}
      initialFocus={() => document.getElementById("amount")}
      finalFocus={finalFocus}
      title={editing ? "Edit expense" : "Add an expense"}
      headerExtra={<SpaceBadge type={space.type} label={space.name} />}
      footer={
        <>
          <Button
            type="submit"
            form={FORM_ID}
            disabled={busy}
            aria-busy={busy && which === "save" ? true : undefined}
            onClick={() => setWhich("save")}
            data-testid="save-expense"
          >
            {busy && which === "save" ? "Saving…" : editing ? "Save changes" : "Save expense"}
          </Button>
          {editing ? null : (
            <Button
              type="button"
              variant="outline"
              disabled={busy}
              aria-busy={busy && which === "again" ? true : undefined}
              onClick={() => save(true)}
              data-testid="save-and-add-another"
            >
              {busy && which === "again" ? "Saving…" : "Save and add another"}
            </Button>
          )}
          <Button type="button" variant="ghost" onClick={requestClose} disabled={busy}>
            Cancel
          </Button>
          {editing ? <DeleteButton label="Delete expense" disabled={busy} onClick={() => setAsk(true)} /> : null}
        </>
      }
    >
      <form id={FORM_ID} method="post" noValidate onSubmit={(e) => { e.preventDefault(); void save(false); }} aria-busy={busy || undefined} className="space-y-4" data-testid={FORM_ID}>
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
        <Field
          id="spent_on"
          type="date"
          label="Date"
          value={values.spent_on}
          aria-required="true"
          error={errors.spent_on}
          onChange={(e) => set("spent_on", e.target.value)}
          onBlur={() => blur("spent_on")}
        />

        <div>
          <Button
            type="button"
            variant="ghost"
            className="-ml-3 justify-start"
            aria-expanded={details}
            aria-controls="expense-details"
            onClick={() => setDetails((d) => !d)}
            data-testid="more-details"
          >
            <ChevronDown aria-hidden="true" className={cn("transition-transform", details ? "rotate-0" : "-rotate-90")} />
            More details
          </Button>
          <div id="expense-details" hidden={!details} className="mt-2 space-y-4">
            <Field
              id="description"
              label="Description (optional)"
              value={values.description}
              maxLength={DESCRIPTION_MAX}
              autoComplete="off"
              error={errors.description}
              onChange={(e) => set("description", e.target.value)}
            />
            <Field
              id="merchant"
              label="Merchant (optional)"
              value={values.merchant}
              maxLength={MERCHANT_MAX}
              autoComplete="off"
              error={errors.merchant}
              onChange={(e) => set("merchant", e.target.value)}
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
            <SelectField
              id="contract_id"
              label="Linked contract (optional)"
              value={values.contract_id}
              onValueChange={(v) => set("contract_id", v)}
              options={contractOptions}
              emptyLabel="No contract"
              hint="If the contract is deleted, this expense stays and loses the link."
              error={errors.contract_id}
            />
          </div>
        </div>
      </form>

      {expense ? (
        <ConfirmDialog
          open={ask}
          onOpenChange={setAsk}
          title="Delete this expense?"
          description={confirmText}
          confirmLabel="Delete expense"
          busyLabel="Deleting…"
          dismissLabel="Keep expense"
          destructive
          onConfirm={async () => {
            const res = await deleteExpense(spaceId, expense.id);
            if (!res.ok) return res.problem.form ?? "We could not delete this expense. Try again.";
            onDeleted();
            return undefined;
          }}
        />
      ) : null}

      <DiscardDialog
        open={discard}
        onOpenChange={f.setDiscard}
        description="Your changes to this expense are not saved."
        onDiscard={() => {
          f.setDiscard(false);
          onOpenChange(false);
        }}
      />
    </ResponsiveDialog>
  );
}

function initialValues(e: ExpenseResponse | null, baseCurrency: string, locale: string, spaceId: string, reference: ReferenceData): ExpenseFormValues {
  if (!e) {
    const last = readLastCategory(spaceId);
    const known = reference.categories.some((c) => c.id === last && c.kind === "expense");
    return {
      amount: "",
      currency: baseCurrency,
      category_id: known ? last : "",
      spent_on: todayIso(),
      description: "",
      merchant: "",
      contract_id: "",
      member_user_id: "",
    };
  }
  return {
    amount: amountToInput(e.amount, { mark: decimalMark(locale), digits: fractionDigits(e.currency, locale) }),
    currency: e.currency,
    category_id: e.category_id,
    spent_on: e.spent_on,
    description: e.description ?? "",
    merchant: e.merchant ?? "",
    contract_id: e.contract_id ?? "",
    member_user_id: e.member_user_id ?? "",
  };
}
