import { Input } from "@/components/ui/input";
import { FieldError } from "@/components/ui/field";
import { Label } from "@/components/ui/label";
import { NativeSelect } from "@/components/ui/native-select";
import { cn } from "@/lib/utils";

export interface CurrencyOption {
  code: string; // ISO-4217, for example "EUR"
  label: string; // shown in the closed select: the code only, for example "EUR" (finance.md 3.1)
}

export interface AmountInputProps {
  /** Id of the amount input. The currency select gets `${id}-currency`. */
  id: string;
  /** API field name for the amount, for example "amount". Server errors map back by this name. */
  name: string;
  label: string; // "Amount"
  /** The raw text as typed, for example "12,50". It is parsed on submit, never here. */
  value: string;
  onValueChange: (raw: string) => void;
  /** Called when focus leaves the amount field, to validate on blur. */
  onBlur?: () => void;
  currency: string;
  currencyOptions: CurrencyOption[];
  onCurrencyChange: (code: string) => void;
  /** The locale's decimal mark, shown in the hint so the user knows what to type. */
  decimalSeparator: "." | ",";
  /** Minor units of the selected currency (EUR 2, JPY 0). Drives the hint only. */
  fractionDigits: number;
  placeholder?: string;
  /** Replaces the default hint. */
  hint?: string;
  /** Error for the amount (client validation or a server error on `amount`). */
  error?: string;
  /** Server error for `currency` (problem+json, field `currency`). Shown under the row, full width. */
  currencyError?: string;
  /** Marks the amount as required with aria-required. The native attribute is not used (finance.md 3.10). */
  required?: boolean;
  disabled?: boolean;
  autoFocus?: boolean;
  className?: string;
}

/**
 * Money input: an amount typed as text and a currency select. `inputMode="decimal"` opens the
 * decimal keypad on phones. The input is type text, not number, so no browser rewrites the value
 * in the user's locale. Parsing and validation happen on submit (see docs/design/finance.md 3.1).
 * Takes the full width of its form section; the amount and currency sit side by side at every width.
 */
export function AmountInput({
  id,
  name,
  label,
  value,
  onValueChange,
  onBlur,
  currency,
  currencyOptions,
  onCurrencyChange,
  decimalSeparator,
  fractionDigits,
  placeholder,
  hint,
  error,
  currencyError,
  required,
  disabled,
  autoFocus,
  className,
}: AmountInputProps) {
  const currencyId = `${id}-currency`;
  const hintId = `${id}-hint`;
  const errorId = `${id}-error`;
  const currencyErrorId = `${id}-currency-error`;
  const defaultHint =
    fractionDigits === 0
      ? "Whole numbers only for this currency."
      : `Use ${decimalSeparator} before the cents.`;
  const describedBy = [hint === "" ? null : hintId, error ? errorId : null].filter(Boolean).join(" ") || undefined;

  return (
    <div className={cn("space-y-2", className)}>
      <div className="grid grid-cols-[minmax(0,1fr)_9rem] gap-3">
        <div className="min-w-0 space-y-2">
          <Label htmlFor={id} className="text-body">
            {label}
          </Label>
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
            className="tabular-nums text-right"
          />
        </div>
        <div className="min-w-0 space-y-2">
          <Label htmlFor={currencyId} className="text-body">
            Currency
          </Label>
          <NativeSelect
            id={currencyId}
            name="currency"
            value={currency}
            disabled={disabled}
            aria-invalid={currencyError ? true : undefined}
            aria-describedby={currencyError ? currencyErrorId : undefined}
            onChange={(e) => onCurrencyChange(e.target.value)}
          >
            {currencyOptions.map((c) => (
              <option key={c.code} value={c.code}>
                {c.label}
              </option>
            ))}
          </NativeSelect>
        </div>
      </div>
      {hint === "" ? null : (
        <p id={hintId} className="text-small text-muted-foreground">
          {hint ?? defaultHint}
        </p>
      )}
      <FieldError id={errorId} error={error} />
      <FieldError id={currencyErrorId} error={currencyError} />
    </div>
  );
}
