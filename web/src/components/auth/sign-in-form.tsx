"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Button } from "@/components/ui/button";
import { createClient } from "@/lib/supabase/client";
import { GENERIC_ERROR, LINK_EXPIRED_ERROR, mapAuthError } from "@/lib/auth/errors";
import { isEmailValid } from "@/lib/auth/password";
import { sanitizeNext } from "@/lib/auth/next-path";
import { Field, useFocusFirstInvalid } from "./form-parts";
import { useHydrated } from "@/lib/hooks/use-hydrated";
import { FormMessage } from "@/components/ui/form-message";
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
  // True after the server rejected the credentials: both fields are then marked invalid and
  // described by the form-level message (we never say which one was wrong).
  const [authFailed, setAuthFailed] = React.useState(false);
  const hydrated = useHydrated();
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
    setAuthFailed(false);
    if (next_.email || next_.password) {
      setAttempt((n) => n + 1);
      return;
    }
    setBusy(true);
    try {
      const { error } = await createClient().auth.signInWithPassword({ email, password });
      if (error) {
        setFormError(mapAuthError(error, "sign-in").message);
        setAuthFailed(true);
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
    // method="post": if the form is ever submitted without JavaScript, nothing goes into the URL.
    <form ref={form} method="post" noValidate onSubmit={onSubmit} className="space-y-4" aria-busy={busy || undefined}>
      <FormMessage kind="error" id="signin-form-error">
        {formError}
      </FormMessage>
      <Field
        id="email"
        label="Email"
        type="email"
        autoComplete="email"
        inputMode="email"
        placeholder="name@example.com"
        error={errors.email}
        invalid={authFailed}
        describedBy={authFailed ? "signin-form-error" : undefined}
      />
      <div className="space-y-1">
        <Field
          id="password"
          label="Password"
          type="password"
          autoComplete="current-password"
          error={errors.password}
          invalid={authFailed}
          describedBy={authFailed ? "signin-form-error" : undefined}
        />
        <div className="text-right">
          <Link href="/forgot-password" className={LINK}>
            Forgot password?
          </Link>
        </div>
      </div>
      <Button type="submit" className="w-full" disabled={busy || !hydrated}>
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
