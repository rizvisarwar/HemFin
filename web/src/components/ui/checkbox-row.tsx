import { cn } from "@/lib/utils";

export interface CheckboxRowProps {
  id: string;
  /** API field name, for example "auto_renew". */
  name: string;
  label: string;
  description?: string;
  checked: boolean;
  onCheckedChange: (checked: boolean) => void;
  disabled?: boolean;
  className?: string;
}

/**
 * A checkbox with its label and description. The whole row is the label, so the hit area is at
 * least 44 px tall and tapping the text toggles the box. The box is a native checkbox.
 */
export function CheckboxRow({
  id,
  name,
  label,
  description,
  checked,
  onCheckedChange,
  disabled,
  className,
}: CheckboxRowProps) {
  const descriptionId = `${id}-description`;
  return (
    <label
      htmlFor={id}
      className={cn(
        "flex min-h-11 cursor-pointer items-start gap-3 py-2",
        disabled && "cursor-not-allowed opacity-60",
        className,
      )}
    >
      <input
        id={id}
        name={name}
        type="checkbox"
        checked={checked}
        disabled={disabled}
        aria-describedby={description ? descriptionId : undefined}
        onChange={(e) => onCheckedChange(e.target.checked)}
        className="mt-0.5 size-5 shrink-0 accent-primary"
      />
      <span className="min-w-0">
        <span className="block text-body text-foreground">{label}</span>
        {description ? (
          <span id={descriptionId} className="block text-small text-muted-foreground">
            {description}
          </span>
        ) : null}
      </span>
    </label>
  );
}
