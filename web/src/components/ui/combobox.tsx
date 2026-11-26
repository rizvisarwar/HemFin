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

/** Free height (px) the list needs below the field to open downward; otherwise it opens above. */
const MIN_BELOW = 200;

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
  /** Accessible name of the list of options, for example "Currencies". */
  listLabel: string;
  placeholder?: string;
  invalid?: boolean;
  describedBy?: string;
  autoComplete?: string;
  className?: string;
  listClassName?: string;
  onPick?: (o: ComboOption) => void;
  /** Called with the input's text after typing, picking or tidying on blur. */
  onTextChange?: (text: string) => void;
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
  listLabel,
  placeholder,
  invalid,
  describedBy,
  autoComplete = "off",
  className,
  listClassName,
  onPick,
  onTextChange,
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
    onTextChange?.(textFor(o));
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
      // Base UI's dialog closes on a document-level keydown that ignores defaultPrevented, so stop
      // the event here: the first Escape closes the list, a second one closes the dialog around it.
      e.stopPropagation();
      setOpen(false);
    }
  }

  // Keep the active option in view while moving with the arrows.
  React.useEffect(() => {
    if (open) document.getElementById(`${id}-opt-${active}`)?.scrollIntoView?.({ block: "nearest" });
  }, [open, active, id]);

  const hasList = open && shown.length > 0;

  // Where the list goes. On the page it opens below the field when at least MIN_BELOW px of the
  // visible viewport (between the sticky top bar and the bottom nav) are free, otherwise above, and
  // its max height is what is free there, so it scrolls inside itself and never covers a bar or
  // makes the page scroll. Inside a dialog the dialog's scroll area is the boundary and the list
  // keeps its default size.
  const wrapRef = React.useRef<HTMLDivElement>(null);
  const [place, setPlace] = React.useState<{ up: boolean; maxHeight?: number }>({ up: false });
  const measure = React.useCallback(() => {
    const wrap = wrapRef.current;
    if (!wrap || wrap.closest("[data-dialog-scroll]")) return setPlace((p) => (p.up || p.maxHeight ? { up: false } : p));
    const field = wrap.getBoundingClientRect();
    const vv = window.visualViewport;
    let top = vv?.offsetTop ?? 0;
    let bottom = (vv?.offsetTop ?? 0) + (vv?.height ?? window.innerHeight);
    for (const bar of document.querySelectorAll<HTMLElement>("[data-viewport-inset]")) {
      const r = bar.getBoundingClientRect();
      if (r.width === 0 || r.height === 0) continue; // hidden at this breakpoint
      if (bar.dataset.viewportInset === "top") top = Math.max(top, r.bottom);
      else bottom = Math.min(bottom, r.top);
    }
    const margin = 8;
    const below = bottom - field.bottom - margin;
    const above = field.top - top - margin;
    const up = below < MIN_BELOW && above > below;
    const maxHeight = Math.max(0, Math.floor(up ? above : below));
    setPlace((p) => (p.up === up && p.maxHeight === maxHeight ? p : { up, maxHeight }));
  }, []);
  React.useLayoutEffect(() => {
    if (!open) return;
    measure();
    window.addEventListener("scroll", measure, true);
    window.addEventListener("resize", measure);
    window.visualViewport?.addEventListener("resize", measure);
    return () => {
      window.removeEventListener("scroll", measure, true);
      window.removeEventListener("resize", measure);
      window.visualViewport?.removeEventListener("resize", measure);
    };
  }, [open, measure]);
  const popupPos = place.up ? "bottom-full mb-1" : "mt-1";

  return (
    <div
      ref={wrapRef}
      className={cn("relative", className)}
      onBlur={(e) => {
        if (e.currentTarget.contains(e.relatedTarget as Node | null)) return;
        setOpen(false);
        // Tidy a text that names an option ("eur" becomes "EUR"); anything else is left for validation.
        const input = inputRef.current;
        const match = input ? resolveOption(options, input.value, textFor) : undefined;
        if (input && match) {
          input.value = textFor(match);
          onTextChange?.(input.value);
        }
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
        aria-controls={hasList ? listId : undefined}
        aria-autocomplete="list"
        aria-activedescendant={hasList && shown[active] ? `${id}-opt-${active}` : undefined}
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
          onTextChange?.(e.currentTarget.value);
          setActive(0);
          setOpen(true);
        }}
        onKeyDown={onKeyDown}
      />
      <ChevronDown aria-hidden="true" className="pointer-events-none absolute right-3 top-3.5 size-4 text-muted-foreground" />
      {hasList ? (
        <ul
          id={listId}
          role="listbox"
          aria-label={listLabel}
          style={place.maxHeight !== undefined ? { maxHeight: Math.min(256, place.maxHeight) } : undefined}
          className={cn(
            "absolute left-0 z-40 max-h-64 w-full min-w-[16rem] overflow-y-auto overscroll-contain rounded-md border border-border bg-popover py-1 text-popover-foreground shadow-lg",
            popupPos,
            listClassName,
          )}
        >
          {shown.map((o, i) => (
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
          ))}
        </ul>
      ) : null}
      {open && shown.length === 0 ? (
        // A message, not an option: it lives outside the listbox.
        <p
          data-testid="combobox-empty"
          className={cn(popupPos, "absolute left-0 z-40 w-full min-w-[16rem] rounded-md border border-border bg-popover px-3 py-3 text-small text-muted-foreground shadow-lg")}
        >
          No match. Try another search.
        </p>
      ) : null}
      <p className="sr-only" role="status" aria-live="polite">
        {open ? (shown.length === 0 ? "No results." : `${shown.length} result${shown.length === 1 ? "" : "s"} available.`) : ""}
      </p>
    </div>
  );
}
