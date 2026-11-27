import * as React from "react";
import { CircleAlert } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

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
