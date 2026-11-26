"use client";

import * as React from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { createClient } from "@/lib/supabase/client";
import { GENERIC_ERROR, mapAuthError, RESET_REQUESTED_MESSAGE } from "@/lib/auth/errors";
import { isEmailValid } from "@/lib/auth/password";
import { CooldownNote, useCooldown } from "./cooldown";
import { Field, useFocusFirstInvalid } from "./form-parts";
import { useHydrated } from "@/lib/hooks/use-hydrated";
import { FormMessage } from "@/components/ui/form-message";

export function ForgotPasswordForm() {
  const form = React.useRef<HTMLFormElement>(null);
  const hydrated = useHydrated();
  const [emailError, setEmailError] = React.useState<string>();
  const [message, setMessage] = React.useState<{ kind: "error" | "success"; text: string } | null>(null);
  const [busy, setBusy] = React.useState(false);
  const [attempt, setAttempt] = React.useState(0);
  const [sentAt, setSentAt] = React.useState<number | null>(null);
  const { remaining, announcement } = useCooldown(sentAt);
  useFocusFirstInvalid(form, attempt);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    // aria-disabled (not disabled) keeps focus on the button during the cooldown, so this guard stops the send.
    if (remaining > 0 || busy) return;
    const email = String(new FormData(e.currentTarget).get("email") ?? "").trim();
    setMessage(null);
    if (!isEmailValid(email)) {
      setEmailError("Enter your email address, for example name@example.com.");
      setAttempt((n) => n + 1);
      return;
    }
    setEmailError(undefined);
    setBusy(true);
    try {
      const { error } = await createClient().auth.resetPasswordForEmail(email, {
        redirectTo: `${window.location.origin}/auth/callback?next=/reset-password`,
      });
      const mapped = error ? mapAuthError(error, "forgot-password") : null;
      // The same confirmation whether or not an account exists; only rate limits and network
      // failures are reported.
      if (mapped && !mapped.treatAsSuccess) {
        setMessage({ kind: "error", text: mapped.message });
      } else {
        setMessage({ kind: "success", text: RESET_REQUESTED_MESSAGE });
        setSentAt(Date.now());
      }
    } catch {
      setMessage({ kind: "error", text: GENERIC_ERROR });
    }
    setBusy(false);
  }

  const cooling = remaining > 0;
  return (
    // method="post": if the form is ever submitted without JavaScript, nothing goes into the URL.
    <form ref={form} method="post" noValidate onSubmit={onSubmit} className="space-y-4" aria-busy={busy || undefined}>
      <FormMessage kind={message?.kind ?? "info"}>{message?.text}</FormMessage>
      <Field
        id="email"
        label="Email"
        type="email"
        autoComplete="email"
        inputMode="email"
        placeholder="name@example.com"
        error={emailError}
      />
      <Button
        type="submit"
        className="w-full"
        disabled={!hydrated}
        aria-disabled={busy || cooling || undefined}
        data-testid="send-reset"
      >
        {busy ? "Sending" : cooling ? `Send again in ${remaining}s` : sentAt ? "Send the link again" : "Send reset link"}
      </Button>
      <CooldownNote remaining={remaining} announcement={announcement} />
      <p className="text-center text-body text-muted-foreground">
        <Link href="/sign-in" className="inline-flex min-h-11 items-center font-medium text-primary underline-offset-4 hover:underline">
          Back to sign in
        </Link>
      </p>
    </form>
  );
}
