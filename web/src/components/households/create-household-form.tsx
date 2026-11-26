"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { setActiveSpace } from "@/app/actions";
import { Field, useFocusFirstInvalid, useHydrated } from "@/components/auth/form-parts";
import { Button } from "@/components/ui/button";
import { FormMessage } from "@/components/ui/form-message";
import { HemCard } from "@/components/ui/hem-card";
import { useToast } from "@/components/ui/toast";
import { createBrowserApi } from "@/lib/api";
import {
  codePointLength,
  HOUSEHOLD_NAME_MAX,
  NAME_COUNTER_FROM,
  validateHouseholdName,
} from "@/lib/households/households";
import { NETWORK_MESSAGE, parseProblem } from "@/lib/profile/problem";
import { useInputValue } from "./use-input-value";

const LIMIT_MESSAGE = "You can own up to 10 households. Transfer or delete one to create another.";

/**
 * Create a household. The input is uncontrolled and read from FormData on submit, so text typed
 * before hydration is kept and nothing is ever put in the URL (the form posts, and the button is
 * disabled until hydrated). On success the new household becomes the selected space (D5).
 */
export function CreateHouseholdForm() {
  const router = useRouter();
  const toast = useToast();
  const form = React.useRef<HTMLFormElement>(null);
  const hydrated = useHydrated();
  const [error, setError] = React.useState<string>();
  const [formError, setFormError] = React.useState<string>();
  const [busy, setBusy] = React.useState(false);
  const [attempt, setAttempt] = React.useState(0);
  useFocusFirstInvalid(form, attempt);
  const length = codePointLength(useInputValue("name").trim());

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (busy) return;
    const name = String(new FormData(e.currentTarget).get("name") ?? "").trim();
    const invalid = validateHouseholdName(name);
    if (invalid) {
      setError(invalid);
      setFormError(undefined);
      setAttempt((n) => n + 1);
      return;
    }
    setError(undefined);
    setFormError(undefined);
    setBusy(true);
    try {
      const api = await createBrowserApi();
      const { data, error: problem, response } = await api.POST("/api/v1/spaces", { body: { name } });
      if (response.ok && data) {
        await setActiveSpace(data.id);
        toast("Household created.");
        router.push(`/household/${data.id}/members`);
        return; // stays busy while the next page loads
      }
      if (response.status === 409) setFormError(LIMIT_MESSAGE);
      else {
        const parsed = parseProblem(response.status, problem);
        if (parsed.fields.name) {
          setError(parsed.fields.name);
          setAttempt((n) => n + 1);
        } else setFormError(parsed.form);
      }
    } catch {
      setFormError(NETWORK_MESSAGE);
    }
    setBusy(false);
  }

  return (
    <HemCard className="max-w-[560px]">
      {/* method="post": if the form is ever submitted without JavaScript, nothing goes into the URL. */}
      <form
        ref={form}
        method="post"
        noValidate
        onSubmit={onSubmit}
        aria-busy={busy || undefined}
        className="space-y-5"
        data-testid="create-household-form"
      >
        <FormMessage kind="error" id="create-form-message">
          {formError}
        </FormMessage>
        <div className="space-y-2">
          <Field
            id="name"
            label="Household name"
            autoComplete="off"
            enterKeyHint="done"
            hint={`For example, The Lee family. Up to ${HOUSEHOLD_NAME_MAX} characters.`}
            error={error}
            // Not when focus moves to the submit button: a message appearing then would push the button away mid-tap.
            onBlur={(e) => {
              if (e.relatedTarget instanceof HTMLButtonElement) return;
              setError(validateHouseholdName(e.currentTarget.value) ?? undefined);
            }}
            // Once a message is showing, follow the typing, so it is already gone when the user taps
            // Create (a message that vanishes on blur would move the button out from under the tap).
            onInput={(e) => error && setError(validateHouseholdName(e.currentTarget.value) ?? undefined)}
          />
          {length >= NAME_COUNTER_FROM ? (
            <p className="text-right text-small text-muted-foreground" data-testid="name-counter">
              {length} of {HOUSEHOLD_NAME_MAX} used
            </p>
          ) : null}
        </div>
        <p className="text-body text-muted-foreground">
          You will be the owner. Only people you invite can join. Your personal space stays separate.
        </p>
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:gap-4">
          <Button
            type="submit"
            className="w-full sm:w-auto"
            disabled={!hydrated}
            aria-disabled={busy || undefined}
            aria-busy={busy || undefined}
            data-testid="create-household"
          >
            {busy ? "Creating…" : "Create household"}
          </Button>
          <Link
            href="/household"
            className="inline-flex min-h-11 items-center justify-center text-body font-medium text-primary underline-offset-4 hover:underline sm:justify-start"
          >
            Cancel
          </Link>
        </div>
      </form>
    </HemCard>
  );
}
