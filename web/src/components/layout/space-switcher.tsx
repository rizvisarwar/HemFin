"use client";

import * as React from "react";
import Link from "next/link";
import { Check, ChevronDown, Lock, Users, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { useHydrated } from "@/lib/hooks/use-hydrated";
import { SpaceBadge } from "@/components/ui/space-badge";
import { compareNames, ROLE_LABEL, truncateCodePoints } from "@/lib/households/households";
import type { SpaceSummary, SpaceType } from "./types";

export interface SpaceSwitcherProps {
  spaces: SpaceSummary[];
  activeSpaceId: string;
  onSelect: (spaceId: string) => void;
  manageHref?: string; // default "/household"
  createHouseholdHref?: string; // default "/household/new"
}

/** Phone trigger shows this many characters of the name (docs/design/households.md 6.9). */
const PHONE_NAME_MAX = 14;

function SpaceIcon({ type, className }: { type: SpaceType; className?: string }) {
  const Icon = type === "personal" ? Lock : Users;
  return (
    <Icon
      aria-hidden="true"
      className={cn("size-4 shrink-0", type === "personal" ? "text-personal" : "text-household", className)}
    />
  );
}

const FOCUSABLE =
  'a[href],button:not([disabled]),input:not([disabled]),select:not([disabled]),textarea:not([disabled]),[tabindex]:not([tabindex="-1"])';

/** The control a Tab (or Shift+Tab) from `from` would reach if `skip` were not in the page. */
function neighbourOf(from: HTMLElement, skip: HTMLElement | null, backwards: boolean): HTMLElement {
  const all = Array.from(document.querySelectorAll<HTMLElement>(FOCUSABLE)).filter(
    (el) => !skip?.contains(el) && el.getClientRects().length > 0 && getComputedStyle(el).visibility !== "hidden",
  );
  const i = all.indexOf(from);
  return all[i + (backwards ? -1 : 1)] ?? from;
}

/**
 * The space switcher: a menu, not a dialog (docs/design/households.md 6.9). It is a bottom sheet
 * below md and a dropdown from md up, in one set of markup.
 *
 * Keyboard: opening focuses the active row; Up and Down move (wrapping), Home and End jump;
 * Enter or Space selects and returns focus to the trigger; Escape closes and returns focus to the
 * trigger; Tab closes the menu and moves on to the next control after the trigger. There is no
 * focus trap: focus is never held inside the menu.
 */
export function SpaceSwitcher({
  spaces,
  activeSpaceId,
  onSelect,
  manageHref = "/household",
  createHouseholdHref = "/household/new",
}: SpaceSwitcherProps) {
  const hydrated = useHydrated(); // the trigger stays disabled until its click handler exists
  const [open, setOpen] = React.useState(false);
  const trigger = React.useRef<HTMLButtonElement>(null);
  const popup = React.useRef<HTMLDivElement>(null);
  const rows = React.useRef<(HTMLElement | null)[]>([]); // the space rows, then the two footer links

  const active = spaces.find((s) => s.id === activeSpaceId) ?? spaces[0];
  // Personal first, then households by name.
  const ordered = React.useMemo(
    () => [
      ...spaces.filter((s) => s.type === "personal"),
      ...spaces.filter((s) => s.type === "household").sort((a, b) => compareNames(a.name, b.name)),
    ],
    [spaces],
  );
  const activeIndex = Math.max(0, ordered.findIndex((s) => s.id === active.id));

  React.useEffect(() => {
    if (open) rows.current[activeIndex]?.focus();
    // Only when the menu opens: later changes of the active space must not steal focus.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  function close(returnFocus: boolean) {
    setOpen(false);
    if (returnFocus) trigger.current?.focus();
  }

  function focusRow(index: number) {
    const n = ordered.length + 2; // rows plus the two footer links
    rows.current[((index % n) + n) % n]?.focus();
  }

  function onKeyDown(e: React.KeyboardEvent) {
    const current = rows.current.findIndex((r) => r === document.activeElement);
    switch (e.key) {
      case "Escape":
        e.preventDefault();
        e.stopPropagation();
        close(true);
        break;
      case "Tab": {
        // Close, then go where Tab would have gone from the trigger. Focus does not return to the trigger.
        e.preventDefault();
        const target = neighbourOf(trigger.current!, popup.current, e.shiftKey);
        setOpen(false);
        target.focus();
        break;
      }
      case "ArrowDown":
        e.preventDefault();
        focusRow(current < 0 ? 0 : current + 1);
        break;
      case "ArrowUp":
        e.preventDefault();
        focusRow(current < 0 ? ordered.length + 1 : current - 1);
        break;
      case "Home":
        e.preventDefault();
        focusRow(0);
        break;
      case "End":
        e.preventDefault();
        focusRow(ordered.length + 1);
        break;
    }
  }

  return (
    <div className="relative min-w-0" data-switcher-open={open || undefined}>
      <button
        ref={trigger}
        type="button"
        aria-haspopup="menu"
        aria-expanded={open}
        disabled={!hydrated}
        aria-label={`Active space: ${active.name}. Switch space.`}
        title={active.name}
        data-testid="space-switcher-trigger"
        onClick={() => setOpen((o) => !o)}
        onKeyDown={(e) => {
          if (e.key === "ArrowDown" && !open) {
            e.preventDefault();
            setOpen(true);
          }
        }}
        className={cn(
          "inline-flex h-11 w-full max-w-44 items-center gap-2 rounded-full border border-border px-3 text-small font-medium text-foreground transition-colors duration-150 ease-out",
          active.type === "personal" ? "bg-personal-subtle" : "bg-household-subtle",
        )}
      >
        <SpaceIcon type={active.type} />
        <span className="truncate md:hidden">{truncateCodePoints(active.name, PHONE_NAME_MAX)}</span>
        <span className="hidden truncate md:inline">{active.name}</span>
        <ChevronDown aria-hidden="true" className="size-4 shrink-0 text-muted-foreground" />
      </button>

      {open ? (
        <>
          {/* Outside tap or click closes. On phone it dims the page; from md up it is invisible. */}
          <div aria-hidden="true" className="fixed inset-0 z-40 bg-black/40 md:bg-transparent" onClick={() => close(false)} />
          <div
            ref={popup}
            onKeyDown={onKeyDown}
            data-testid="space-switcher-popup"
            className={cn(
              "z-50 flex flex-col overflow-y-auto bg-popover text-popover-foreground shadow-level-2",
              // Phone: bottom sheet.
              "fixed inset-x-0 bottom-0 max-h-[85dvh] rounded-t-xl border-t border-border pb-[env(safe-area-inset-bottom)]",
              // md and up: dropdown aligned to the trigger's right edge.
              "md:absolute md:inset-x-auto md:bottom-auto md:right-0 md:top-full md:mt-2 md:max-h-[70dvh] md:w-70 md:rounded-lg md:border",
            )}
          >
            <div aria-hidden="true" className="mx-auto mt-2 h-1 w-10 shrink-0 rounded-full bg-border md:hidden" />
            <div className="flex items-center justify-between gap-2 px-4 pt-2 md:hidden">
              <p className="text-h3">Switch space</p>
              <button
                type="button"
                aria-label="Close"
                onClick={() => close(true)}
                className="inline-flex size-11 items-center justify-center rounded-md hover:bg-accent"
              >
                <X aria-hidden="true" className="size-5" />
              </button>
            </div>
            {/* Heading row: the active space's badge. Not clickable (D13). */}
            <div className="border-b border-border px-4 py-2 md:px-3">
              <SpaceBadge type={active.type} label={active.name} wrap />
            </div>
            <div role="menu" aria-label="Spaces" className="p-2">
              {ordered.map((space, i) => {
                const checked = space.id === active.id;
                const meta = space.type === "personal" ? "Only you" : space.role ? ROLE_LABEL[space.role] : "";
                return (
                  <button
                    key={space.id}
                    ref={(el) => {
                      rows.current[i] = el;
                    }}
                    type="button"
                    role="menuitemradio"
                    aria-checked={checked}
                    tabIndex={i === activeIndex ? 0 : -1}
                    onClick={() => {
                      close(true);
                      onSelect(space.id);
                    }}
                    className="flex min-h-14 w-full items-center gap-3 rounded-md px-3 text-left text-body hover:bg-accent md:min-h-11"
                  >
                    <SpaceIcon type={space.type} />
                    <span className="min-w-0 flex-1">
                      <span className="line-clamp-2 break-words text-body-strong">{space.name}</span>
                      {meta ? <span className="block text-small text-muted-foreground">{meta}</span> : null}
                    </span>
                    {checked ? <Check aria-hidden="true" className="size-5 shrink-0" /> : null}
                  </button>
                );
              })}
              {/* After a separator, still inside the menu: arrows, Home and End reach them, Enter follows the link. */}
              <div role="separator" className="-mx-2 my-2 border-t border-border" />
              {[
                { href: manageHref, label: "Manage households" },
                { href: createHouseholdHref, label: "Create a household" },
              ].map((link, j) => (
                <Link
                  key={link.href}
                  ref={(el) => {
                    rows.current[ordered.length + j] = el;
                  }}
                  href={link.href}
                  role="menuitem"
                  tabIndex={-1}
                  onClick={() => setOpen(false)}
                  className="flex min-h-11 items-center rounded-md px-3 text-body font-medium text-primary hover:bg-accent"
                >
                  {link.label}
                </Link>
              ))}
            </div>
          </div>
        </>
      ) : null}
    </div>
  );
}
