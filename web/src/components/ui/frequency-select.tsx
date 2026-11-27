import { CircleAlert } from "lucide-react";
import { Label } from "@/components/ui/label";
import { NativeSelect } from "@/components/ui/native-select";
import { cn } from "@/lib/utils";

/** Values match the API enum (HEM-018). `irregular` is income only (HEM-019). */
export type Frequency = "weekly" | "monthly" | "quarterly" | "semiannual" | "annual" | "irregular";

/** Option labels. Plain words, no jargon. */
export const FREQUENCY_LABEL: Record<Frequency, string> = {
  weekly: "Weekly",
  monthly: "Monthly",
  quarterly: "Every 3 months",
  semiannual: "Every 6 months",
  annual: "Yearly",
  irregular: "Irregular",
};

/** The phrase after an amount: "EUR 4,350.00 a year". Irregular has no phrase. */
export const FREQUENCY_PHRASE: Record<Frequency, string> = {
  weekly: "a week",
  monthly: "a month",
  quarterly: "every 3 months",
  semiannual: "every 6 months",
  annual: "a year",
  irregular: "",
};

/** Irregular has no phrase (finance.md 3.5). Income sources add "typical amount" after the amount (6.3). */
const CONTRACT_OPTIONS: Frequency[] = ["weekly", "monthly", "quarterly", "semiannual", "annual"];
const INCOME_OPTIONS: Frequency[] = ["monthly", "quarterly", "semiannual", "annual", "weekly", "irregular"];

export interface FrequencySelectProps {
  id: string;
  /** API field name, always "frequency". */
  name?: string;
  label: string; // "How often" or "Billed"
  value: Frequency;
  onValueChange: (value: Frequency) => void;
  /** Income sources only. Contracts never offer "irregular". */
  includeIrregular?: boolean;
  /** Marks the field as required with aria-required (no native attribute; finance.md 3.10). */
  required?: boolean;
  hint?: string;
  error?: string;
  disabled?: boolean;
  className?: string;
}

/** Frequency picker for contracts (no irregular) and income sources (with irregular). */
export function FrequencySelect({
  id,
  name = "frequency",
  label,
  value,
  onValueChange,
  includeIrregular,
  required,
  hint,
  error,
  disabled,
  className,
}: FrequencySelectProps) {
  const hintId = `${id}-hint`;
  const errorId = `${id}-error`;
  const describedBy = [hint ? hintId : null, error ? errorId : null].filter(Boolean).join(" ") || undefined;
  const options = includeIrregular ? INCOME_OPTIONS : CONTRACT_OPTIONS;

  return (
    <div className={cn("space-y-2", className)}>
      <Label htmlFor={id} className="text-body">
        {label}
      </Label>
      <NativeSelect
        id={id}
        name={name}
        value={value}
        disabled={disabled}
        aria-required={required || undefined}
        aria-invalid={error ? true : undefined}
        aria-describedby={describedBy}
        onChange={(e) => onValueChange(e.target.value as Frequency)}
      >
        {options.map((f) => (
          <option key={f} value={f}>
            {FREQUENCY_LABEL[f]}
          </option>
        ))}
      </NativeSelect>
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
