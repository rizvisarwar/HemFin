"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { createBrowserApi, type ProfileResponse } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Combobox, resolveOption } from "@/components/ui/combobox";
import { HemCard } from "@/components/ui/hem-card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { NativeSelect } from "@/components/ui/native-select";
import { Field, FieldError, useFocusFirstInvalid, useHydrated } from "@/components/auth/form-parts";
import { FormMessage } from "@/components/ui/form-message";
import { useFormat } from "@/components/format-provider";
import { countryByCode, countryOptions, type ComboOption } from "@/lib/profile/countries";
import { currencyOptions } from "@/lib/profile/currencies";
import { localeOptionsWith } from "@/lib/profile/locales";
import { buildPhone, phoneDefaults } from "@/lib/profile/phone";
import { NETWORK_MESSAGE, parseProblem } from "@/lib/profile/problem";

const DISPLAY_NAME_MAX = 80;

const phoneCountries = countryOptions("en", true);
const currencies = currencyOptions("en");
const phoneCountryText = (o: ComboOption) => `${o.label} (${o.hint})`;
const currencyText = (o: ComboOption) => o.value;

interface Saved {
  displayName: string;
  profile: ProfileResponse;
}

type Errors = Partial<Record<"display_name" | "phone" | "base_currency" | "locale", string>>;

/** The API's field names mapped to the form's field ids. */
const FIELD_OF_API: Record<string, keyof Errors> = {
  display_name: "display_name",
  phone_e164: "phone",
  base_currency: "base_currency",
  locale: "locale",
};

const text = (fd: FormData, name: string) => String(fd.get(name) ?? "");

/**
 * Profile form: display name, read-only email, phone, base currency and locale.
 *
 * Every input is uncontrolled and read from FormData on submit, so text typed before hydration is
 * kept and nothing is ever put in the URL (the form posts, and the button is disabled until
 * hydrated). Values are never logged.
 */
export function ProfileForm({ email, displayName, profile }: { email: string; displayName: string | null; profile: ProfileResponse }) {
  const router = useRouter();
  const form = React.useRef<HTMLFormElement>(null);
  const hydrated = useHydrated();
  const { money } = useFormat();
  const [saved, setSaved] = React.useState<Saved>({ displayName: displayName ?? "", profile });
  const [version, setVersion] = React.useState(0);
  const [errors, setErrors] = React.useState<Errors>({});
  const [message, setMessage] = React.useState<{ kind: "error" | "success"; text: string } | null>(null);
  const [busy, setBusy] = React.useState(false);
  const [attempt, setAttempt] = React.useState(0);
  useFocusFirstInvalid(form, attempt);

  // Same on the server and in the browser: the stored number's country, else the locale's region.
  const phone = phoneDefaults(saved.profile.phone_e164, saved.profile.locale);
  const phoneCountry = phone.country ? countryByCode(phone.country) : undefined;
  const phoneCountryDefault = phoneCountry ? `${phoneCountryOption(phoneCountry.code)} (+${phoneCountry.dial})` : "";
  // The example follows the currency being picked, in the saved locale (docs/design/profile.md 6.4).
  const [pickedCurrency, setPickedCurrency] = React.useState<string>();
  const exampleCurrency = pickedCurrency ?? saved.profile.base_currency;

  function fail(errs: Errors, formMessage?: string) {
    setErrors(errs);
    setMessage(formMessage ? { kind: "error", text: formMessage } : null);
    setAttempt((n) => n + 1);
  }

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (busy) return;
    const fd = new FormData(e.currentTarget);
    const name = text(fd, "display_name").trim();
    const currency = resolveOption(currencies, text(fd, "base_currency"), currencyText)?.value;
    const phoneInput = text(fd, "phone");
    const country = resolveOption(phoneCountries, text(fd, "phone_country"), phoneCountryText)?.value;
    const locale = text(fd, "locale");

    const errs: Errors = {};
    // Count characters (code points), as the API does.
    if ([...name].length > DISPLAY_NAME_MAX) errs.display_name = `Use at most ${DISPLAY_NAME_MAX} characters.`;
    if (!currency) errs.base_currency = "Choose a currency from the list.";
    if (phoneInput.trim() !== "" && !phoneInput.trim().startsWith("+") && !country) {
      errs.phone = "Choose the country this number belongs to.";
    }
    if (Object.keys(errs).length > 0) return fail(errs);

    setErrors({});
    setMessage(null);
    setBusy(true);
    try {
      const api = await createBrowserApi();
      const { data, error, response } = await api.PATCH("/api/v1/me/profile", {
        body: {
          display_name: name === "" ? null : name,
          phone_e164: buildPhone(country ?? "", phoneInput),
          base_currency: currency,
          locale,
        },
      });
      if (!response.ok || !data) {
        const problem = parseProblem(response.status, error);
        const next: Errors = {};
        const unmapped: string[] = [];
        for (const [field, msg] of Object.entries(problem.fields)) {
          const target = FIELD_OF_API[field];
          if (target) next[target] = msg;
          else unmapped.push(msg);
        }
        fail(next, problem.form ?? (unmapped.length ? unmapped.join(" ") : undefined));
      } else {
        // Re-render the inputs from what the API stored (for example the phone in its normalised form).
        setSaved({ displayName: data.display_name ?? "", profile: data });
        setVersion((v) => v + 1);
        setPickedCurrency(undefined);
        setMessage({ kind: "success", text: "Profile saved." });
        router.refresh(); // the (app) layout re-reads the base currency and locale for every page
      }
    } catch {
      fail({}, NETWORK_MESSAGE);
    }
    setBusy(false);
  }

  return (
    <HemCard>
      <h2 id="profile-heading" className="text-h2">
        Your details
      </h2>
      {/* method="post": if the form is ever submitted without JavaScript, nothing goes into the URL. */}
      <form
        ref={form}
        method="post"
        noValidate
        onSubmit={onSubmit}
        onInput={() => message?.kind === "success" && setMessage(null)}
        aria-labelledby="profile-heading"
        aria-busy={busy || undefined}
        className="mt-4 space-y-5"
        data-testid="profile-form"
      >
        <FormMessage kind={message?.kind ?? "info"} id="profile-form-message">
          {message?.text}
        </FormMessage>

        <div key={version} className="space-y-5">
          <Field
            id="display_name"
            label="Display name"
            autoComplete="name"
            defaultValue={saved.displayName}
            hint="Shown to the people you share a household with."
            error={errors.display_name}
          />

          <div className="space-y-2">
            <Label htmlFor="email" className="text-body">
              Email
            </Label>
            {/* Read-only and without a name, so it is never part of a form post. */}
            <Input id="email" type="email" value={email} readOnly aria-describedby="email-hint" className="bg-muted text-muted-foreground" />
            <p id="email-hint" className="text-small text-muted-foreground">
              This is the address you sign in with. Changing it is not available yet, so keep using this one for now.
            </p>
          </div>

          <div className="space-y-2" role="group" aria-labelledby="phone-label">
            <Label id="phone-label" htmlFor="phone" className="text-body">
              Phone
            </Label>
            <div className="grid gap-2 md:grid-cols-[14rem_minmax(0,1fr)]">
              <Combobox
                id="phone_country"
                name="phone_country"
                label="Phone country"
                listLabel="Phone countries"
                options={phoneCountries}
                textFor={phoneCountryText}
                defaultText={phoneCountryDefault}
                placeholder="Country"
              />
              <Input
                id="phone"
                name="phone"
                type="tel"
                inputMode="tel"
                autoComplete="tel-national"
                placeholder="6 1234 5678"
                defaultValue={phone.number}
                aria-invalid={errors.phone ? true : undefined}
                aria-describedby={["phone-hint", errors.phone ? "phone-error" : null].filter(Boolean).join(" ")}
              />
            </div>
            <p id="phone-hint" className="text-small text-muted-foreground">
              Optional. Pick the country, then type the number. We save it in international format.
            </p>
            <FieldError id="phone-error" error={errors.phone} />
          </div>

          <div className="space-y-2">
            <Label htmlFor="base_currency" className="text-body">
              Base currency
            </Label>
            <Combobox
              id="base_currency"
              name="base_currency"
              options={currencies}
              textFor={currencyText}
              defaultText={saved.profile.base_currency}
              invalid={!!errors.base_currency}
              describedBy={["base_currency-hint", errors.base_currency ? "base_currency-error" : null].filter(Boolean).join(" ")}
              listLabel="Currencies"
              onTextChange={(t) => {
                const match = resolveOption(currencies, t, currencyText);
                // Follows whatever the text resolves to (typed, picked or tidied on blur); text that
                // names no currency falls back to the saved one.
                setPickedCurrency(match?.value);
              }}
              placeholder="Search, for example EUR or Euro"
            />
            <p id="base_currency-hint" className="text-small text-muted-foreground">
              Totals and reports are shown in this currency. Example:{" "}
              <span data-testid="money-example">{money("1240.50", { currency: exampleCurrency })}</span>
            </p>
            <FieldError id="base_currency-error" error={errors.base_currency} />
          </div>

          <div className="space-y-2">
            <Label htmlFor="locale" className="text-body">
              Locale
            </Label>
            <NativeSelect
              id="locale"
              name="locale"
              defaultValue={saved.profile.locale}
              aria-invalid={errors.locale ? true : undefined}
              aria-describedby={["locale-hint", errors.locale ? "locale-error" : null].filter(Boolean).join(" ")}
            >
              {localeOptionsWith(saved.profile.locale).map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </NativeSelect>
            <p id="locale-hint" className="text-small text-muted-foreground">
              Sets how numbers and dates are written.
            </p>
            <FieldError id="locale-error" error={errors.locale} />
          </div>
        </div>

        <Button type="submit" className="w-full sm:w-auto" disabled={!hydrated} aria-disabled={busy || undefined} aria-busy={busy || undefined} data-testid="save-profile">
          {busy ? "Saving…" : "Save changes"}
        </Button>
      </form>
    </HemCard>
  );
}

function phoneCountryOption(code: string): string {
  return phoneCountries.find((o) => o.value === code)?.label ?? code;
}
