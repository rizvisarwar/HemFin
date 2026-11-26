"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { createClient } from "@/lib/supabase/client";
import { GENERIC_ERROR, mapAuthError } from "@/lib/auth/errors";
import { isPasswordValid } from "@/lib/auth/password";
import { Field, PasswordRules, useFocusFirstInvalid, useHydrated } from "./form-parts";
import { FormMessage } from "@/components/ui/form-message";

/** Reached from the reset email: the callback has already exchanged the code for a session. */
export function ResetPasswordForm() {
  const router = useRouter();
  const form = React.useRef<HTMLFormElement>(null);
  const hydrated = useHydrated();
  const [errors, setErrors] = React.useState<{ password?: string; confirm?: string }>({});
  const [formError, setFormError] = React.useState("");
  const [done, setDone] = React.useState(false);
  const [busy, setBusy] = React.useState(false);
  const [attempt, setAttempt] = React.useState(0);
  useFocusFirstInvalid(form, attempt);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    // Both passwords are uncontrolled inputs read on submit, so text typed before hydration survives it.
    const data = new FormData(e.currentTarget);
    const password = String(data.get("password") ?? "");
    const confirm = String(data.get("confirm") ?? "");
    const found: typeof errors = {};
    if (!isPasswordValid(password)) found.password = "Your password does not meet all the rules yet.";
    if (confirm !== password) found.confirm = "The two passwords do not match.";
    setErrors(found);
    setFormError("");
    if (found.password || found.confirm) {
      setAttempt((n) => n + 1);
      return;
    }
    setBusy(true);
    try {
      const { error } = await createClient().auth.updateUser({ password });
      if (error) {
        setFormError(mapAuthError(error, "reset-password").message);
        setBusy(false);
        return;
      }
      setDone(true);
      setTimeout(() => {
        router.replace("/dashboard");
        router.refresh();
      }, 1500);
    } catch {
      setFormError(GENERIC_ERROR);
      setBusy(false);
    }
  }

  if (done) {
    return (
      <FormMessage kind="success">Your password has been changed. Taking you to your dashboard.</FormMessage>
    );
  }
  return (
    // method="post": if the form is ever submitted without JavaScript, nothing goes into the URL.
    <form ref={form} method="post" noValidate onSubmit={onSubmit} className="space-y-4" aria-busy={busy || undefined}>
      <FormMessage kind="error">{formError}</FormMessage>
      <div className="space-y-2">
        <Field
          id="password"
          label="New password"
          type="password"
          autoComplete="new-password"
          error={errors.password}
          describedBy="password-rules"
        />
        <PasswordRules inputId="password" id="password-rules" />
      </div>
      <Field id="confirm" label="Confirm new password" type="password" autoComplete="new-password" error={errors.confirm} />
      <Button type="submit" className="w-full" disabled={busy || !hydrated}>
        {busy ? "Saving" : "Change password"}
      </Button>
      <p className="text-center text-body text-muted-foreground">
        Link expired?{" "}
        <Link href="/forgot-password" className="inline-flex min-h-11 items-center font-medium text-primary underline-offset-4 hover:underline">
          Request a new one
        </Link>
      </p>
    </form>
  );
}
