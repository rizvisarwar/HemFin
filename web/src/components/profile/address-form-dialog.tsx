"use client";

import * as React from "react";
import { createBrowserApi, type AddressResponse } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Combobox, resolveOption } from "@/components/ui/combobox";
import { Label } from "@/components/ui/label";
import { ResponsiveDialog } from "@/components/ui/responsive-dialog";
import { Field, FieldError, useFocusFirstInvalid } from "@/components/auth/form-parts";
import { FormMessage } from "@/components/ui/form-message";
import { addressPayload, validateAddress, type AddressErrors, type AddressValues } from "@/lib/profile/address";
import { countryByCode, countryName, countryOptions } from "@/lib/profile/countries";
import { ADDRESS_LIMIT_MESSAGE, NETWORK_MESSAGE, parseProblem } from "@/lib/profile/problem";

const countries = countryOptions("en");

const val = (fd: FormData, name: string) => String(fd.get(name) ?? "");

export interface AddressDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** The address being edited, or null to add a new one. */
  address: AddressResponse | null;
  /** True when the user has no address yet: the first one becomes the default on its own. */
  isFirst: boolean;
  /** Called after the API accepted the change. */
  onSaved: (kind: "added" | "updated") => void;
}

/**
 * Add or edit an address in a dialog (a bottom sheet on phone). Fields are uncontrolled and read
 * from FormData; the dialog content only exists while open, in the browser, so there is no
 * server-rendered form to submit early. Values are never logged.
 */
export function AddressFormDialog({ open, onOpenChange, address, isFirst, onSaved }: AddressDialogProps) {
  const [busy, setBusy] = React.useState(false);
  return (
    <ResponsiveDialog
      open={open}
      onOpenChange={onOpenChange}
      busy={busy}
      initialFocus={() => document.getElementById("label")}
      title={address ? "Edit address" : "Add address"}
      description={address ? undefined : "Where should we send things, or which address do your documents use?"}
      footer={
        <>
          <Button type="submit" form="address-form" disabled={busy} aria-disabled={busy || undefined} aria-busy={busy || undefined} data-testid="save-address">
            {busy ? "Saving…" : address ? "Save address" : "Add address"}
          </Button>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={busy}>
            Cancel
          </Button>
        </>
      }
    >
      <AddressForm address={address} isFirst={isFirst} busy={busy} setBusy={setBusy} onSaved={onSaved} />
    </ResponsiveDialog>
  );
}

function AddressForm({
  address,
  isFirst,
  busy,
  setBusy,
  onSaved,
}: {
  address: AddressResponse | null;
  isFirst: boolean;
  busy: boolean;
  setBusy: (busy: boolean) => void;
  onSaved: (kind: "added" | "updated") => void;
}) {
  const form = React.useRef<HTMLFormElement>(null);
  const [errors, setErrors] = React.useState<AddressErrors>({});
  const [formError, setFormError] = React.useState<string>();
  const [attempt, setAttempt] = React.useState(0);
  useFocusFirstInvalid(form, attempt);

  function fail(errs: AddressErrors, message?: string) {
    setErrors(errs);
    setFormError(message);
    setAttempt((n) => n + 1);
  }

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (busy) return;
    const fd = new FormData(e.currentTarget);
    const countryText = val(fd, "country");
    const country = resolveOption(countries, countryText)?.value ?? countryText.trim().toUpperCase();
    const values: AddressValues = {
      label: val(fd, "label"),
      line1: val(fd, "line1"),
      line2: val(fd, "line2"),
      city: val(fd, "city"),
      region: val(fd, "region"),
      postcode: val(fd, "postcode"),
      country: countryText.trim() === "" ? "" : country,
    };
    const errs = validateAddress(values, (c) => countryByCode(c) !== undefined);
    if (Object.keys(errs).length > 0) return fail(errs);

    setErrors({});
    setFormError(undefined);
    setBusy(true);
    try {
      const api = await createBrowserApi();
      const body = addressPayload(values);
      const result = address
        ? await api.PATCH("/api/v1/me/addresses/{address_id}", { params: { path: { address_id: address.id } }, body })
        : await api.POST("/api/v1/me/addresses", { body: { ...body, is_default: fd.get("is_default") === "on" } });
      if (!result.response.ok) {
        const problem = parseProblem(result.response.status, result.error);
        const next: AddressErrors = {};
        for (const [field, msg] of Object.entries(problem.fields)) {
          if (field in values) next[field as keyof AddressValues] = msg;
        }
        // The 20-address cap has its own friendly wording, whatever the API's text says.
        const message = problem.status === 409 && !address && /at most|limit/i.test(problem.form ?? "") ? ADDRESS_LIMIT_MESSAGE : problem.form;
        fail(next, message);
        setBusy(false);
        return;
      }
      setBusy(false);
      onSaved(address ? "updated" : "added");
    } catch {
      fail({}, NETWORK_MESSAGE);
      setBusy(false);
    }
  }

  return (
    <form ref={form} id="address-form" method="post" noValidate onSubmit={onSubmit} aria-busy={busy || undefined} className="space-y-4" data-testid="address-form">
      <FormMessage kind="error">{formError}</FormMessage>
      <Field id="label" label="Name" placeholder="Home" autoComplete="off" defaultValue={address?.label} error={errors.label} />
      <Field id="line1" label="Street and number" autoComplete="address-line1" defaultValue={address?.line1} error={errors.line1} />
      <Field id="line2" label="Address line 2 (optional)" autoComplete="address-line2" defaultValue={address?.line2 ?? ""} error={errors.line2} />
      <div className="grid grid-cols-[8rem_minmax(0,1fr)] gap-3">
        <Field id="postcode" label="Postcode" autoComplete="postal-code" defaultValue={address?.postcode ?? ""} error={errors.postcode} />
        <Field id="city" label="City" autoComplete="address-level2" defaultValue={address?.city} error={errors.city} />
      </div>
      <Field id="region" label="Region (optional)" autoComplete="address-level1" defaultValue={address?.region ?? ""} error={errors.region} />
      <div className="space-y-2">
        <Label htmlFor="country" className="text-body">
          Country
        </Label>
        <Combobox
          id="country"
          name="country"
          listLabel="Countries"
          options={countries}
          defaultText={address ? countryName(address.country) : ""}
          invalid={!!errors.country}
          describedBy={errors.country ? "country-error" : undefined}
          autoComplete="country-name"
          placeholder="Search for a country"
          listClassName="max-h-48"
        />
        <FieldError id="country-error" error={errors.country} />
      </div>
      {!address && !isFirst ? (
        <label className="flex min-h-11 items-center gap-3 text-body">
          <input type="checkbox" name="is_default" className="size-5 shrink-0 accent-primary" />
          Make this my default address
        </label>
      ) : null}
      {!address && isFirst ? <p className="text-small text-muted-foreground">Your first address becomes your default address.</p> : null}
    </form>
  );
}
