"use client";

import * as React from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { createClient } from "@/lib/supabase/client";
import { CHECK_EMAIL_MESSAGE, GENERIC_ERROR, mapAuthError } from "@/lib/auth/errors";
import { isEmailValid } from "@/lib/auth/password";
import { parsePending, readPendingRaw, rememberPending } from "@/lib/auth/pending";
import { CooldownNote, useCooldown } from "./cooldown";
import { Field, useHydrated } from "./form-parts";
import { FormMessage } from "@/components/ui/form-message";

const noopSubscribe = () => () => {};

export function CheckEmail() {
  // sessionStorage exists only in the browser: the server snapshot is null (shown after hydration).
  const raw = React.useSyncExternalStore(noopSubscribe, readPendingRaw, () => null);
  const ready = raw !== null;
  const hydrated = useHydrated();
  const stored = parsePending(raw ?? "	");
  const [override, setOverride] = React.useState<{ email: string; sentAt: number } | null>(null);
  const email = override?.email ?? stored.email;
  const sentAt = override?.sentAt ?? stored.sentAt;
  const { remaining, announcement } = useCooldown(sentAt);
  const [message, setMessage] = React.useState<{ kind: "error" | "success"; text: string } | null>(null);
  const [busy, setBusy] = React.useState(false);
  const [emailError, setEmailError] = React.useState<string>();

  async function resend(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    // aria-disabled (not disabled) keeps focus on the button during the cooldown, so this guard stops the send.
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
        setOverride({ email: target, sentAt: Date.now() });
      }
    } catch {
      setMessage({ kind: "error", text: GENERIC_ERROR });
    }
    setBusy(false);
  }

  const cooling = remaining > 0;
  return (
    <div className="space-y-4">
      {/* Neutral wording, true on every path (a new sign-up, or an address that already has an account). */}
      <p className="text-body">
        {email ? (
          <>
            If you can sign up with <strong className="font-medium">{email}</strong>, we&apos;ve sent a link to confirm it.
          </>
        ) : (
          "If you can sign up with that address, we've sent a link to confirm it."
        )}{" "}
        Open the link on this device to finish creating your account.
      </p>
      <ul className="list-disc space-y-1 pl-5 text-small text-muted-foreground">
        <li>It can take a few minutes. Check your spam folder too.</li>
        <li>The link works once and expires after an hour.</li>
      </ul>
      {/* method="post": if the form is ever submitted without JavaScript, nothing goes into the URL. */}
      <form onSubmit={resend} method="post" noValidate className="space-y-3">
        <FormMessage kind={message?.kind ?? "info"}>{message?.text}</FormMessage>
        {ready && !email ? (
          <Field id="email" label="Email" type="email" autoComplete="email" inputMode="email" error={emailError} />
        ) : null}
        <Button
          type="submit"
          variant="outline"
          className="w-full"
          disabled={!hydrated}
          aria-disabled={busy || cooling || undefined}
          data-testid="resend"
        >
          {cooling ? `Send again in ${remaining}s` : "Send the email again"}
        </Button>
        <CooldownNote remaining={remaining} announcement={announcement} />
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
