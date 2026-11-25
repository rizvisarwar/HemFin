"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Button } from "@/components/ui/button";
import { createClient } from "@/lib/supabase/client";
import { GENERIC_ERROR, LINK_EXPIRED_ERROR, mapAuthError } from "@/lib/auth/errors";
import { isEmailValid } from "@/lib/auth/password";
import { sanitizeNext } from "@/lib/auth/next-path";
import { Field, FormMessage, useFocusFirstInvalid } from "./form-parts";
import { GoogleButton, OrDivider } from "./google-button";

const LINK = "inline-flex min-h-11 items-center font-medium text-primary underline-offset-4 hover:underline";

export function SignInForm() {
  const router = useRouter();
  const params = useSearchParams();
  const next = params.get("next");
  const form = React.useRef<HTMLFormElement>(null);
  const [errors, setErrors] = React.useState<{ email?: string; password?: string }>({});
  const [formError, setFormError] = React.useState<string>(
    params.get("error") === "link" ? LINK_EXPIRED_ERROR : "",
  );
  const [busy, setBusy] = React.useState(false);
  const [attempt, setAttempt] = React.useState(0);
  useFocusFirstInvalid(form, attempt);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const data = new FormData(e.currentTarget);
    const email = String(data.get("email") ?? "").trim();
    const password = String(data.get("password") ?? "");
    const next_: typeof errors = {};
    if (!isEmailValid(email)) next_.email = "Enter your email address, for example name@example.com.";
    if (!password) next_.password = "Enter your password.";
    setErrors(next_);
    setFormError("");
    if (next_.email || next_.password) {
      setAttempt((n) => n + 1);
      return;
    }
    setBusy(true);
    try {
      const { error } = await createClient().auth.signInWithPassword({ email, password });
      if (error) {
        setFormError(mapAuthError(error, "sign-in").message);
        setBusy(false);
        return;
      }
      router.replace(sanitizeNext(next));
      router.refresh();
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
      <div className="space-y-1">
        <Field id="password" label="Password" type="password" autoComplete="current-password" error={errors.password} />
        <div className="text-right">
          <Link href="/forgot-password" className={LINK}>
            Forgot password?
          </Link>
        </div>
      </div>
      <Button type="submit" className="w-full" disabled={busy}>
        {busy ? "Signing in" : "Sign in"}
      </Button>
      <OrDivider />
      <GoogleButton next={next} onError={setFormError} />
      <p className="text-center text-body text-muted-foreground">
        New to HemFin?{" "}
        <Link href={`/sign-up${qs}`} className={LINK}>
          Create an account
        </Link>
      </p>
    </form>
  );
}
