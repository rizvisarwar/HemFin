"use client";

import * as React from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { createClient } from "@/lib/supabase/client";
import { CHECK_EMAIL_MESSAGE, GENERIC_ERROR, mapAuthError } from "@/lib/auth/errors";
import { isEmailValid } from "@/lib/auth/password";
import { cooldownRemaining, parsePending, readPendingRaw, rememberPending } from "@/lib/auth/pending";
import { Field, FormMessage } from "./form-parts";

const noopSubscribe = () => () => {};

export function CheckEmail() {
  // sessionStorage exists only in the browser: the server snapshot is null (shown after hydration).
  const raw = React.useSyncExternalStore(noopSubscribe, readPendingRaw, () => null);
  const ready = raw !== null;
  const stored = parsePending(raw ?? "	");
  const [override, setOverride] = React.useState<{ email: string; sentAt: number } | null>(null);
  const email = override?.email ?? stored.email;
  const sentAt = override?.sentAt ?? stored.sentAt;
  // The clock starts at the send time and is advanced by the interval below (no clock read while rendering).
  const [now, setNow] = React.useState<number | null>(null);
  const remaining = cooldownRemaining(sentAt, now ?? sentAt ?? 0);
  const [message, setMessage] = React.useState<{ kind: "error" | "success"; text: string } | null>(null);
  const [busy, setBusy] = React.useState(false);
  const [emailError, setEmailError] = React.useState<string>();

  React.useEffect(() => {
    if (sentAt === null || remaining <= 0) return;
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, [sentAt, remaining]);

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
        rememberPending(target);
        const sent = Date.now();
        setOverride({ email: target, sentAt: sent });
        setNow(sent);
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
