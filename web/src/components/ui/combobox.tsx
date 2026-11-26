"use client";

import * as React from "react";
import { ChevronDown } from "lucide-react";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import type { ComboOption } from "@/lib/profile/countries";

/**
 * Finds the option a typed text means: its value (code), its label, the text the field shows for it
 * (`textFor`), or the only label that starts with what was typed.
 */
export function resolveOption(
  options: readonly ComboOption[],
  text: string,
  textFor: (o: ComboOption) => string = (o) => o.label,
): ComboOption | undefined {
  const t = text.trim().toLowerCase();
  if (!t) return undefined;
  const exact = options.find(
    (o) => o.value.toLowerCase() === t || o.label.toLowerCase() === t || textFor(o).toLowerCase() === t,
  );
  if (exact) return exact;
  const matches = options.filter((o) => o.label.toLowerCase().startsWith(t));
  return matches.length === 1 ? matches[0] : undefined;
}

export interface ComboboxProps {
  id: string;
  /** Form field name: the input's text is submitted, and `resolveOption` turns it back into a value. */
  name?: string;
  options: readonly ComboOption[];
  /** Initial text. The input is uncontrolled, so text typed before hydration is never lost. */
  defaultText?: string;
  /** Text put in the input when an option is picked. */
  textFor?: (o: ComboOption) => string;
  label?: string; // accessible name when there is no <label for>
  placeholder?: string;
  invalid?: boolean;
  describedBy?: string;
  autoComplete?: string;
  className?: string;
  listClassName?: string;
  onPick?: (o: ComboOption) => void;
}

/**
 * Searchable select (ARIA combobox with a listbox). A text input filters the list as you type;
 * arrows, Enter and Escape work as in a native select. The input is uncontrolled and the open
 * state only exists after hydration, so the server HTML is a plain text input with its value.
 */
export function Combobox({
  id,
  name,
  options,
  defaultText,
  textFor = (o) => o.label,
  label,
  placeholder,
  invalid,
  describedBy,
  autoComplete = "off",
  className,
  listClassName,
  onPick,
}: ComboboxProps) {
  const inputRef = React.useRef<HTMLInputElement>(null);
  const [open, setOpen] = React.useState(false);
  const [query, setQuery] = React.useState("");
  const [active, setActive] = React.useState(0);
  const listId = `${id}-list`;

  const shown = React.useMemo(() => {
    const q = query.trim().toLowerCase();
    return q ? options.filter((o) => o.search.includes(q)) : options;
  }, [options, query]);

  function pick(o: ComboOption) {
    if (inputRef.current) inputRef.current.value = textFor(o);
    setQuery("");
    setOpen(false);
    onPick?.(o);
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      e.preventDefault();
      if (!open) {
        setOpen(true);
        return;
      }
      const n = shown.length;
      if (n) setActive((i) => (e.key === "ArrowDown" ? (i + 1) % n : (i - 1 + n) % n));
    } else if (e.key === "Enter" && open && shown[active]) {
      e.preventDefault(); // pick, do not submit the form
      pick(shown[active]);
    } else if (e.key === "Escape" && open) {
      e.preventDefault();
      setOpen(false);
    }
  }

  // Keep the active option in view while moving with the arrows.
  React.useEffect(() => {
    if (open) document.getElementById(`${id}-opt-${active}`)?.scrollIntoView?.({ block: "nearest" });
  }, [open, active, id]);

  return (
    <div
      className={cn("relative", className)}
      onBlur={(e) => {
        if (e.currentTarget.contains(e.relatedTarget as Node | null)) return;
        setOpen(false);
        // Tidy a text that names an option ("eur" becomes "EUR"); anything else is left for validation.
        const input = inputRef.current;
        const match = input ? resolveOption(options, input.value, textFor) : undefined;
        if (input && match) input.value = textFor(match);
        setQuery("");
      }}
    >
      <Input
        ref={inputRef}
        id={id}
        name={name}
        type="text"
        role="combobox"
        aria-expanded={open}
        aria-controls={listId}
        aria-autocomplete="list"
        aria-activedescendant={open && shown[active] ? `${id}-opt-${active}` : undefined}
        aria-label={label}
        aria-invalid={invalid || undefined}
        aria-describedby={describedBy}
        autoComplete={autoComplete}
        autoCapitalize="off"
        spellCheck={false}
        defaultValue={defaultText}
        placeholder={placeholder}
        className="pr-10"
        onFocus={() => setOpen(true)}
        onClick={() => setOpen(true)}
        onInput={(e) => {
          setQuery(e.currentTarget.value);
          setActive(0);
          setOpen(true);
        }}
        onKeyDown={onKeyDown}
      />
      <ChevronDown aria-hidden="true" className="pointer-events-none absolute right-3 top-3.5 size-4 text-muted-foreground" />
      {open ? (
        <ul
          id={listId}
          role="listbox"
          aria-label={label ?? "Options"}
          className={cn(
            "absolute left-0 z-40 mt-1 max-h-64 w-full min-w-[16rem] overflow-y-auto overscroll-contain rounded-md border border-border bg-popover py-1 text-popover-foreground shadow-lg",
            listClassName,
          )}
        >
          {shown.length === 0 ? (
            <li role="presentation" className="px-3 py-3 text-small text-muted-foreground">
              No match. Try another search.
            </li>
          ) : (
            shown.map((o, i) => (
              <li
                key={o.value}
                id={`${id}-opt-${i}`}
                role="option"
                aria-selected={i === active}
                // mousedown would blur the input and close the list before the click lands.
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => pick(o)}
                onMouseMove={() => i !== active && setActive(i)}
                className={cn(
                  "flex min-h-11 cursor-pointer items-center justify-between gap-3 px-3 py-2 text-body",
                  i === active && "bg-accent text-accent-foreground",
                )}
              >
                <span className="min-w-0 truncate">{o.label}</span>
                {o.hint ? <span className="shrink-0 text-small text-muted-foreground">{o.hint}</span> : null}
              </li>
            ))
          )}
        </ul>
      ) : null}
      <p className="sr-only" role="status" aria-live="polite">
        {open ? (shown.length === 0 ? "No results." : `${shown.length} result${shown.length === 1 ? "" : "s"} available.`) : ""}
      </p>
    </div>
  );
}
