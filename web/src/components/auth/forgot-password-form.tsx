"use client";

import * as React from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { createClient } from "@/lib/supabase/client";
import { GENERIC_ERROR, mapAuthError, RESET_REQUESTED_MESSAGE } from "@/lib/auth/errors";
import { isEmailValid } from "@/lib/auth/password";
import { Field, FormMessage, useFocusFirstInvalid } from "./form-parts";

export function ForgotPasswordForm() {
  const form = React.useRef<HTMLFormElement>(null);
  const [emailError, setEmailError] = React.useState<string>();
  const [message, setMessage] = React.useState<{ kind: "error" | "success"; text: string } | null>(null);
  const [busy, setBusy] = React.useState(false);
  const [attempt, setAttempt] = React.useState(0);
  useFocusFirstInvalid(form, attempt);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
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
      setMessage(
        mapped && !mapped.treatAsSuccess
          ? { kind: "error", text: mapped.message }
          : { kind: "success", text: RESET_REQUESTED_MESSAGE },
      );
    } catch {
      setMessage({ kind: "error", text: GENERIC_ERROR });
    }
    setBusy(false);
  }

  return (
    <form ref={form} noValidate onSubmit={onSubmit} className="space-y-4" aria-busy={busy || undefined}>
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
      <Button type="submit" className="w-full" disabled={busy}>
        {busy ? "Sending" : "Send reset link"}
      </Button>
      <p className="text-center text-body text-muted-foreground">
        <Link href="/sign-in" className="inline-flex min-h-11 items-center font-medium text-primary underline-offset-4 hover:underline">
          Back to sign in
        </Link>
      </p>
    </form>
  );
}
