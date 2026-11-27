import { Input } from "@/components/ui/input";
import { FieldError } from "@/components/ui/field";
import { Label } from "@/components/ui/label";
import { AMOUNT_HINT } from "@/lib/finance/amount";
import { cn } from "@/lib/utils";

export interface AmountInputProps {
  id: string;
  /** API field name for the amount, for example "amount". Server errors map back by this name. */
  name: string;
  label: string; // "Amount"
  /** The raw text as typed, for example "12,50". It is parsed on submit, never here. */
  value: string;
  onValueChange: (raw: string) => void;
  /** Called when focus leaves the field, to validate on blur. */
  onBlur?: () => void;
  placeholder?: string;
  /** Replaces the default hint. */
  hint?: string;
  /** Error for the amount (client validation or a server error on `amount`). */
  error?: string;
  /** Marks the amount as required with aria-required. The native attribute is not used (finance.md 3.10). */
  required?: boolean;
  disabled?: boolean;
  autoFocus?: boolean;
  className?: string;
}

/**
 * Money input (SEK): an amount typed as text with a "kr" suffix. `inputMode="decimal"` opens the
 * decimal keypad on phones. The input is type text, not number, so no browser rewrites the value.
 * Parsing and validation happen on submit (`parseAmount`; docs/design/finance.md 3.1). Takes the
 * full width of its form section.
 */
export function AmountInput({
  id,
  name,
  label,
  value,
  onValueChange,
  onBlur,
  placeholder,
  hint,
  error,
  required,
  disabled,
  autoFocus,
  className,
}: AmountInputProps) {
  const hintId = `${id}-hint`;
  const errorId = `${id}-error`;
  // The error takes the hint's place, so it sits right under the field (finance.md 3.1).
  const showHint = hint !== "" && !error;
  const describedBy = error ? errorId : showHint ? hintId : undefined;

  return (
    <div className={cn("space-y-2", className)}>
      <Label htmlFor={id} className="text-body">
        {label}
      </Label>
      <div className="relative">
        <Input
          id={id}
          name={name}
          type="text"
          inputMode="decimal"
          autoComplete="off"
          autoCorrect="off"
          spellCheck={false}
          placeholder={placeholder}
          value={value}
          disabled={disabled}
          autoFocus={autoFocus}
          aria-required={required || undefined}
          aria-invalid={error ? true : undefined}
          aria-describedby={describedBy}
          onChange={(e) => onValueChange(e.target.value)}
          onBlur={onBlur}
          className="whitespace-nowrap pr-10 text-right tabular-nums"
        />
        <span aria-hidden="true" className="pointer-events-none absolute inset-y-0 right-3 flex items-center text-body text-muted-foreground">
          kr
        </span>
      </div>
      {showHint ? (
        <p id={hintId} className="text-small text-muted-foreground">
          {hint ?? AMOUNT_HINT}
        </p>
      ) : null}
      <FieldError id={errorId} error={error} />
    </div>
  );
}
