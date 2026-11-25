"use client";

import * as React from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { createClient } from "@/lib/supabase/client";
import { CHECK_EMAIL_MESSAGE, GENERIC_ERROR, mapAuthError } from "@/lib/auth/errors";
import { isEmailValid } from "@/lib/auth/password";
import { cooldownRemaining, LAST_SENT_KEY, PENDING_EMAIL_KEY, RESEND_COOLDOWN_SECONDS } from "@/lib/auth/pending";
import { Field, FormMessage } from "./form-parts";

function read(key: string): string | null {
  try {
    return sessionStorage.getItem(key);
  } catch {
    return null;
  }
}

export function CheckEmail() {
  // Read after mount: sessionStorage does not exist on the server.
  const [email, setEmail] = React.useState<string | null>(null);
  const [ready, setReady] = React.useState(false);
  const [remaining, setRemaining] = React.useState(0);
  const [message, setMessage] = React.useState<{ kind: "error" | "success"; text: string } | null>(null);
  const [busy, setBusy] = React.useState(false);
  const [emailError, setEmailError] = React.useState<string>();

  React.useEffect(() => {
    const last = read(LAST_SENT_KEY);
    setEmail(read(PENDING_EMAIL_KEY));
    setRemaining(cooldownRemaining(last ? Number(last) : null, Date.now()));
    setReady(true);
  }, []);

  React.useEffect(() => {
    if (remaining <= 0) return;
    const t = setTimeout(() => setRemaining((n) => Math.max(0, n - 1)), 1000);
    return () => clearTimeout(t);
  }, [remaining]);

  async function resend(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (remaining > 0 || busy) return;
    let target = email;
    if (!target) {
      target = String(new FormData(e.currentTarget).get("email") ?? "").trim();
      if (!isEmailValid(target)) {
        setEmailError("Enter the email address you signed up with.");
        return;
      }
      setEmailError(undefined);
    }
    setBusy(true);
    setMessage(null);
    try {
      const { error } = await createClient().auth.resend({
        type: "signup",
        email: target,
        options: { emailRedirectTo: `${window.location.origin}/auth/callback` },
      });
      const mapped = error ? mapAuthError(error, "resend") : null;
      if (mapped && !mapped.treatAsSuccess) {
        setMessage({ kind: "error", text: mapped.message });
      } else {
        setMessage({ kind: "success", text: CHECK_EMAIL_MESSAGE });
        try {
          sessionStorage.setItem(PENDING_EMAIL_KEY, target);
          sessionStorage.setItem(LAST_SENT_KEY, String(Date.now()));
        } catch {
          // ignore blocked storage
        }
        setEmail(target);
        setRemaining(RESEND_COOLDOWN_SECONDS);
      }
    } catch {
      setMessage({ kind: "error", text: GENERIC_ERROR });
    }
    setBusy(false);
  }

  return (
    <div className="space-y-4">
      <p className="text-body">
        {email ? (
          <>
            We sent a link to <strong className="font-medium">{email}</strong>. Open it on this device to finish creating your
            account.
          </>
        ) : (
          "We sent you a link to confirm your email address. Open it on this device to finish creating your account."
        )}
      </p>
      <ul className="list-disc space-y-1 pl-5 text-small text-muted-foreground">
        <li>It can take a few minutes. Check your spam folder too.</li>
        <li>The link works once and expires after an hour.</li>
      </ul>
      <form onSubmit={resend} noValidate className="space-y-3">
        <FormMessage kind={message?.kind ?? "info"}>{message?.text}</FormMessage>
        {ready && !email ? (
          <Field id="email" label="Email" type="email" autoComplete="email" inputMode="email" error={emailError} />
        ) : null}
        <Button type="submit" variant="outline" className="w-full" disabled={busy || remaining > 0} data-testid="resend">
          {remaining > 0 ? `Send again in ${remaining}s` : "Send the email again"}
        </Button>
      </form>
      <p className="text-center text-body text-muted-foreground">
        Wrong address?{" "}
        <Link href="/sign-up" className="inline-flex min-h-11 items-center font-medium text-primary underline-offset-4 hover:underline">
          Start again
        </Link>
      </p>
    </div>
  );
}
