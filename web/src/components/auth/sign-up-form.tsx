"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Button } from "@/components/ui/button";
import { createClient } from "@/lib/supabase/client";
import { GENERIC_ERROR, mapAuthError } from "@/lib/auth/errors";
import { isEmailValid, isPasswordValid } from "@/lib/auth/password";
import { sanitizeNext } from "@/lib/auth/next-path";
import { LAST_SENT_KEY, PENDING_EMAIL_KEY } from "@/lib/auth/pending";
import { Field, FormMessage, PasswordRules, useFocusFirstInvalid } from "./form-parts";
import { GoogleButton, OrDivider } from "./google-button";

const LINK = "inline-flex min-h-11 items-center font-medium text-primary underline-offset-4 hover:underline";

export function SignUpForm() {
  const router = useRouter();
  const params = useSearchParams();
  const next = params.get("next");
  const form = React.useRef<HTMLFormElement>(null);
  const [password, setPassword] = React.useState("");
  const [errors, setErrors] = React.useState<{ email?: string; password?: string }>({});
  const [formError, setFormError] = React.useState("");
  const [busy, setBusy] = React.useState(false);
  const [attempt, setAttempt] = React.useState(0);
  useFocusFirstInvalid(form, attempt);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const email = String(new FormData(e.currentTarget).get("email") ?? "").trim();
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
      try {
        sessionStorage.setItem(PENDING_EMAIL_KEY, email);
        sessionStorage.setItem(LAST_SENT_KEY, String(Date.now()));
      } catch {
        // Storage can be blocked; the check-email page then asks for the address again.
      }
      router.push("/check-email");
    } catch {
      setFormError(GENERIC_ERROR);
      setBusy(false);
    }
  }

  const qs = next ? `?next=${encodeURIComponent(sanitizeNext(next))}` : "";
  return (
    <form ref={form} noValidate onSubmit={onSubmit} className="space-y-4" aria-busy={busy || undefined}>
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
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          error={errors.password}
          aria-describedby="password-rules password-error"
        />
        <PasswordRules password={password} id="password-rules" />
      </div>
      <Button type="submit" className="w-full" disabled={busy}>
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
