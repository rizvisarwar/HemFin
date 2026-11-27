import { CircleAlert } from "lucide-react";
import { Label } from "@/components/ui/label";
import { NativeSelect } from "@/components/ui/native-select";
import { cn } from "@/lib/utils";

export interface CategoryOption {
  value: string; // category id from the API
  label: string; // display name, for example "Home insurance"
}

export interface CategoryGroup {
  label: string; // group heading, for example "Insurance"
  options: CategoryOption[];
}

export interface CategorySelectProps {
  id: string;
  /** API field name, for example "category_id". Server errors map back by this name. */
  name: string;
  label: string;
  groups: CategoryGroup[];
  value: string;
  onValueChange: (value: string) => void;
  /** First option. In a form it is a disabled placeholder; in a filter it is "All categories". */
  emptyLabel: string;
  /** True for forms: the empty option is disabled, so a category must be chosen. */
  emptyDisabled?: boolean;
  /** Marks the field as required with aria-required (no native attribute; finance.md 3.10). */
  required?: boolean;
  hint?: string;
  error?: string;
  disabled?: boolean;
  className?: string;
}

/**
 * Category picker: a native select with one optgroup per parent category. The native picker is
 * the best control on phones, and the groups keep a long list scannable. Custom categories go in
 * a group named "Your categories" at the end (the caller builds the groups).
 */
export function CategorySelect({
  id,
  name,
  label,
  groups,
  value,
  onValueChange,
  emptyLabel,
  emptyDisabled,
  required,
  hint,
  error,
  disabled,
  className,
}: CategorySelectProps) {
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
        aria-required={required || undefined}
        aria-invalid={error ? true : undefined}
        aria-describedby={describedBy}
        onChange={(e) => onValueChange(e.target.value)}
      >
        <option value="" disabled={emptyDisabled}>
          {emptyLabel}
        </option>
        {groups.map((group) => (
          <optgroup key={group.label} label={group.label}>
            {group.options.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </optgroup>
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
