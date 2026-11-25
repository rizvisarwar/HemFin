"use client";

import * as React from "react";
import { CircleAlert, CircleCheck, Circle } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import { passwordRuleResults } from "@/lib/auth/password";

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
}

/** Label above, input, then an inline error (announced politely) or hint. */
export function Field({ id, label, error, hint, className, ...props }: FieldProps) {
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
        aria-invalid={error ? true : undefined}
        aria-describedby={[error ? errorId : null, hint ? hintId : null].filter(Boolean).join(" ") || undefined}
        className={className}
        {...props}
      />
      {hint ? (
        <p id={hintId} className="text-small text-muted-foreground">
          {hint}
        </p>
      ) : null}
      <div aria-live="polite" id={errorId}>
        {error ? (
          <p className="flex items-start gap-1.5 text-small text-destructive">
            <CircleAlert aria-hidden="true" className="mt-0.5 size-4 shrink-0" />
            <span>{error}</span>
          </p>
        ) : null}
      </div>
    </div>
  );
}

/** Live checklist of the password rules. Each rule is a list item with a text status. */
export function PasswordRules({ password, id }: { password: string; id: string }) {
  const rules = passwordRuleResults(password);
  return (
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
  );
}

/** Form-level message. The live region exists from first render so changes are announced. */
export function FormMessage({
  kind,
  children,
}: {
  kind: "error" | "success" | "info";
  children?: React.ReactNode;
}) {
  return (
    <div aria-live={kind === "error" ? "assertive" : "polite"} role={kind === "error" ? "alert" : "status"} data-testid="form-message">
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
