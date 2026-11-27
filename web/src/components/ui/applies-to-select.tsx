import { FieldError } from "@/components/ui/field";
import { Label } from "@/components/ui/label";
import { NativeSelect } from "@/components/ui/native-select";
import { cn } from "@/lib/utils";

export interface AppliesToOption {
  value: string; // member user id from the space's member list
  label: string; // display name only. Never an email address in a picker.
}

export interface AppliesToSelectProps {
  id: string;
  /** API field name, always "member_user_id". */
  name?: string;
  label?: string; // "Applies to"
  options: AppliesToOption[];
  /** "" means the whole household (member_user_id null). */
  value: string;
  onValueChange: (value: string) => void;
  /** Label for the "" option. */
  wholeLabel?: string; // "Whole household"
  hint?: string;
  error?: string;
  disabled?: boolean;
  className?: string;
}

/**
 * "Applies to": which member a record belongs to, or the whole household. It is only rendered in
 * a household space. A personal space has one member, so the caller does not render this there.
 */
export function AppliesToSelect({
  id,
  name = "member_user_id",
  label = "Applies to",
  options,
  value,
  onValueChange,
  wholeLabel = "Whole household",
  hint,
  error,
  disabled,
  className,
}: AppliesToSelectProps) {
  const hintId = `${id}-hint`;
  const errorId = `${id}-error`;
  const describedBy = [hint ? hintId : null, error ? errorId : null].filter(Boolean).join(" ") || undefined;

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
        aria-invalid={error ? true : undefined}
        aria-describedby={describedBy}
        onChange={(e) => onValueChange(e.target.value)}
      >
        <option value="">{wholeLabel}</option>
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
