"use client";

import * as React from "react";
import { CircleAlert, CircleCheck, Circle } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import { passwordRuleResults } from "@/lib/auth/password";

const noopSubscribe = () => () => {};

/**
 * False in the server HTML and during hydration, true once the component has mounted in the
 * browser. Submit buttons stay disabled until then, so a form can never be submitted before its
 * JavaScript is attached (which would send it as a plain browser form post).
 */
export function useHydrated(): boolean {
  return React.useSyncExternalStore(noopSubscribe, () => true, () => false);
}

/** Moves focus to the first invalid field after a failed submit. Bump `attempt` on each submit. */
export function useFocusFirstInvalid(form: React.RefObject<HTMLFormElement | null>, attempt: number) {
  React.useEffect(() => {
    if (attempt === 0) return;
    form.current?.querySelector<HTMLElement>('[aria-invalid="true"]')?.focus();
  }, [form, attempt]);
}

export interface FieldProps extends Omit<React.ComponentProps<"input">, "id"> {
  id: string;
  label: string;
  error?: string;
  hint?: string;
  /** Mark the field invalid without an inline message (the message lives elsewhere). */
  invalid?: boolean;
  /** Extra element ids that describe the field (for example a form-level error). */
  describedBy?: string;
}

/** Label above, input, then an inline error (announced politely) or hint. */
export function Field({ id, label, error, hint, invalid, describedBy, className, ...props }: FieldProps) {
  const errorId = `${id}-error`;
  const hintId = `${id}-hint`;
  return (
    <div className="space-y-2">
      <Label htmlFor={id} className="text-body">
        {label}
      </Label>
      <Input
        id={id}
        name={id}
        aria-invalid={error || invalid ? true : undefined}
        aria-describedby={
          [error ? errorId : null, hint ? hintId : null, describedBy].filter(Boolean).join(" ") || undefined
        }
        className={className}
        {...props}
      />
      {hint ? (
        <p id={hintId} className="text-small text-muted-foreground">
          {hint}
        </p>
      ) : null}
      <FieldError id={errorId} error={error} />
    </div>
  );
}

/** Inline field error. The live region exists from first render so a new message is announced politely. */
export function FieldError({ id, error }: { id: string; error?: string }) {
  return (
    <div aria-live="polite" id={id}>
      {error ? (
        <p className="flex items-start gap-1.5 text-small text-destructive">
          <CircleAlert aria-hidden="true" className="mt-0.5 size-4 shrink-0" />
          <span>{error}</span>
        </p>
      ) : null}
    </div>
  );
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

/** Form-level message. The live region exists from first render so changes are announced. */
export function FormMessage({
  kind,
  children,
  id,
}: {
  kind: "error" | "success" | "info";
  children?: React.ReactNode;
  id?: string;
}) {
  return (
    <div
      id={id}
      aria-live={kind === "error" ? "assertive" : "polite"}
      role={kind === "error" ? "alert" : "status"}
      data-testid="form-message"
    >
      {children ? (
        <p
          className={cn(
            "rounded-md px-3 py-2 text-small",
            kind === "error" && "bg-destructive-subtle text-destructive",
            kind === "success" && "bg-success-subtle text-success",
            kind === "info" && "bg-accent text-accent-foreground",
          )}
        >
          {children}
        </p>
      ) : null}
    </div>
  );
}
