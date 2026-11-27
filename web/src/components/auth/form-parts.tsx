"use client";

import * as React from "react";
import { CircleCheck, Circle } from "lucide-react";
import { cn } from "@/lib/utils";
import { passwordRuleResults } from "@/lib/auth/password";

/** Moves focus to the first invalid field after a failed submit. Bump `attempt` on each submit. */
export function useFocusFirstInvalid(form: React.RefObject<HTMLFormElement | null>, attempt: number) {
  React.useEffect(() => {
    if (attempt === 0) return;
    form.current?.querySelector<HTMLElement>('[aria-invalid="true"]')?.focus();
  }, [form, attempt]);
}

/**
 * Live checklist of the password rules for the (uncontrolled) input with id `inputId`.
 *
 * The input is not controlled by React: a password typed before hydration must survive it. The
 * checklist reads the input's value through useSyncExternalStore, which re-reads it once on mount
 * (so text typed earlier is counted) and on every `input` event afterwards.
 *
 * A short polite summary ("2 of 4 password rules met") is announced a moment after typing
 * stops, and only when it changes, so screen reader users are not told about every keystroke.
 */
export function PasswordRules({ inputId, id }: { inputId: string; id: string }) {
  const password = React.useSyncExternalStore(
    React.useCallback(
      (onChange) => {
        const el = document.getElementById(inputId);
        el?.addEventListener("input", onChange);
        return () => el?.removeEventListener("input", onChange);
      },
      [inputId],
    ),
    () => (document.getElementById(inputId) as HTMLInputElement | null)?.value ?? "",
    () => "",
  );
  const rules = passwordRuleResults(password);
  const metCount = rules.filter((r) => r.met).length;
  const summary =
    password === ""
      ? ""
      : metCount === rules.length
        ? "All password rules met."
        : `${metCount} of ${rules.length} password rules met.`;

  const [announced, setAnnounced] = React.useState("");
  React.useEffect(() => {
    const t = setTimeout(() => setAnnounced(summary), 1000);
    return () => clearTimeout(t);
  }, [summary]);

  return (
    <>
      <ul id={id} aria-label="Password rules" className="space-y-1 text-small">
        {rules.map((r) => (
          <li key={r.id} className={cn("flex items-center gap-2", r.met ? "text-success" : "text-muted-foreground")}>
            {r.met ? (
              <CircleCheck aria-hidden="true" className="size-4 shrink-0" />
            ) : (
              <Circle aria-hidden="true" className="size-4 shrink-0" />
            )}
            <span>
              {r.label}
              <span className="sr-only">{r.met ? " (done)" : " (not done yet)"}</span>
            </span>
          </li>
        ))}
      </ul>
      <p className="sr-only" role="status" aria-live="polite" data-testid="password-rules-summary">
        {announced}
      </p>
    </>
  );
}
