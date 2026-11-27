import { CircleAlert } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { NativeSelect } from "@/components/ui/native-select";
import { cn } from "@/lib/utils";

export interface CurrencyOption {
  code: string; // ISO-4217, for example "EUR"
  label: string; // shown in the select, for example "EUR, euro"
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
  error?: string;
  disabled?: boolean;
  autoFocus?: boolean;
  className?: string;
}

/**
 * Money input: an amount typed as text and a currency select. `inputMode="decimal"` opens the
 * decimal keypad on phones. The input is type text, not number, so no browser rewrites the value
 * in the user's locale. Parsing and validation happen on submit (see docs/design/finance.md 3.1).
 */
export function AmountInput({
  id,
  name,
  label,
  value,
  onValueChange,
  currency,
  currencyOptions,
  onCurrencyChange,
  decimalSeparator,
  fractionDigits,
  placeholder,
  hint,
  error,
  disabled,
  autoFocus,
  className,
}: AmountInputProps) {
  const currencyId = `${id}-currency`;
  const hintId = `${id}-hint`;
  const errorId = `${id}-error`;
  const defaultHint =
    fractionDigits === 0
      ? "Whole numbers only for this currency."
      : `Use ${decimalSeparator} before the cents.`;
  const describedBy = [hint === "" ? null : hintId, error ? errorId : null].filter(Boolean).join(" ") || undefined;

  return (
    <div className={cn("space-y-2", className)}>
      <div className="grid grid-cols-[minmax(0,1fr)_9rem] gap-3">
        <div className="space-y-2">
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
            aria-invalid={error ? true : undefined}
            aria-describedby={describedBy}
            onChange={(e) => onValueChange(e.target.value)}
            className="tabular-nums text-right"
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor={currencyId} className="text-body">
            Currency
          </Label>
          <NativeSelect
            id={currencyId}
            name="currency"
            value={currency}
            disabled={disabled}
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
