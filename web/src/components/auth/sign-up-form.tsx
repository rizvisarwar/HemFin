"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Button } from "@/components/ui/button";
import { createClient } from "@/lib/supabase/client";
import { GENERIC_ERROR, mapAuthError } from "@/lib/auth/errors";
import { isEmailValid, isPasswordValid } from "@/lib/auth/password";
import { sanitizeNext } from "@/lib/auth/next-path";
import { rememberPending } from "@/lib/auth/pending";
import { Field, PasswordRules, useFocusFirstInvalid } from "./form-parts";
import { useHydrated } from "@/lib/hooks/use-hydrated";
import { FormMessage } from "@/components/ui/form-message";
import { GoogleButton, OrDivider } from "./google-button";

const LINK = "inline-flex min-h-11 items-center font-medium text-primary underline-offset-4 hover:underline";

export function SignUpForm() {
  const router = useRouter();
  const params = useSearchParams();
  const next = params.get("next");
  const form = React.useRef<HTMLFormElement>(null);
  const hydrated = useHydrated();
  const [errors, setErrors] = React.useState<{ email?: string; password?: string }>({});
  const [formError, setFormError] = React.useState("");
  const [busy, setBusy] = React.useState(false);
  const [attempt, setAttempt] = React.useState(0);
  useFocusFirstInvalid(form, attempt);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    // The password is an uncontrolled input read on submit, so text typed before hydration survives it.
    const data = new FormData(e.currentTarget);
    const email = String(data.get("email") ?? "").trim();
    const password = String(data.get("password") ?? "");
    const found: typeof errors = {};
    if (!isEmailValid(email)) found.email = "Enter a valid email address, for example name@example.com.";
    if (!isPasswordValid(password)) found.password = "Your password does not meet all the rules yet.";
    setErrors(found);
    setFormError("");
    if (found.email || found.password) {
      setAttempt((n) => n + 1);
      return;
    }
    setBusy(true);
    try {
      const target = sanitizeNext(next);
      const { error } = await createClient().auth.signUp({
        email,
        password,
        options: { emailRedirectTo: `${window.location.origin}/auth/callback?next=${encodeURIComponent(target)}` },
      });
      const mapped = error ? mapAuthError(error, "sign-up") : null;
      if (mapped && !mapped.treatAsSuccess) {
        setFormError(mapped.message);
        setBusy(false);
        return;
      }
      rememberPending(email);
      // Keep where the user was going (for example /invite), so a resent email returns there too.
      router.push(next ? `/check-email?next=${encodeURIComponent(target)}` : "/check-email");
    } catch {
      setFormError(GENERIC_ERROR);
      setBusy(false);
    }
  }

  const qs = next ? `?next=${encodeURIComponent(sanitizeNext(next))}` : "";
  return (
    // method="post": if the form is ever submitted without JavaScript, nothing goes into the URL.
    <form ref={form} method="post" noValidate onSubmit={onSubmit} className="space-y-4" aria-busy={busy || undefined}>
      <FormMessage kind="error">{formError}</FormMessage>
      <Field
        id="email"
        label="Email"
        type="email"
        autoComplete="email"
        inputMode="email"
        placeholder="name@example.com"
        error={errors.email}
      />
      <div className="space-y-2">
        <Field
          id="password"
          label="Password"
          type="password"
          autoComplete="new-password"
          error={errors.password}
          describedBy="password-rules"
        />
        <PasswordRules inputId="password" id="password-rules" />
      </div>
      <Button type="submit" className="w-full" disabled={busy || !hydrated}>
        {busy ? "Creating account" : "Create account"}
      </Button>
      <OrDivider />
      <GoogleButton next={next} onError={setFormError} />
      <p className="text-center text-body text-muted-foreground">
        Already have an account?{" "}
        <Link href={`/sign-in${qs}`} className={LINK}>
          Sign in
        </Link>
      </p>
    </form>
  );
}
