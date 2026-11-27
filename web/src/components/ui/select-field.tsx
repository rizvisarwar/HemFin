import { FieldError } from "@/components/ui/field";
import { Label } from "@/components/ui/label";
import { NativeSelect } from "@/components/ui/native-select";
import { cn } from "@/lib/utils";

export interface SelectFieldProps {
  id: string;
  /** API field name, for example "source_id". Defaults to the id. */
  name?: string;
  label: string;
  value: string;
  onValueChange: (value: string) => void;
  options: { value: string; label: string }[];
  /** First option, with the value "" (for example "No source"). */
  emptyLabel?: string;
  hint?: string;
  error?: string;
  disabled?: boolean;
  className?: string;
}

/** A labelled native select with a hint and an error, for the plain pickers (source, contract). Category and member pickers have their own. */
export function SelectField({ id, name, label, value, onValueChange, options, emptyLabel, hint, error, disabled, className }: SelectFieldProps) {
  const hintId = `${id}-hint`;
  const errorId = `${id}-error`;
  const describedBy = [error ? errorId : null, hint ? hintId : null].filter(Boolean).join(" ") || undefined;
  return (
    <div className={cn("space-y-2", className)}>
      <Label htmlFor={id} className="text-body">
        {label}
      </Label>
      <NativeSelect
        id={id}
        name={name ?? id}
        value={value}
        disabled={disabled}
        aria-invalid={error ? true : undefined}
        aria-describedby={describedBy}
        onChange={(e) => onValueChange(e.target.value)}
      >
        {emptyLabel !== undefined ? <option value="">{emptyLabel}</option> : null}
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </NativeSelect>
      {hint ? (
        <p id={hintId} className="text-small text-muted-foreground">
          {hint}
        </p>
      ) : null}
      <FieldError id={errorId} error={error} />
    </div>
  );
}
