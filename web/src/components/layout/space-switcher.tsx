"use client";

import * as React from "react";
import Link from "next/link";
import { Check, ChevronDown, Lock, Users } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import { SpaceBadge } from "@/components/ui/space-badge";
import type { SpaceSummary, SpaceType } from "./types";

export interface SpaceSwitcherProps {
  spaces: SpaceSummary[];
  activeSpaceId: string;
  onSelect: (spaceId: string) => void;
  createHouseholdHref?: string;
  variant?: "default" | "compact"; // compact on phone: name truncated at 14 characters
}

const ROLE_LABEL = { owner: "Owner", admin: "Admin", member: "Member" } as const;

function truncate(name: string, max: number) {
  return name.length > max ? `${name.slice(0, max)}…` : name;
}

function SpaceIcon({ type, className }: { type: SpaceType; className?: string }) {
  const Icon = type === "personal" ? Lock : Users;
  return (
    <Icon
      aria-hidden="true"
      className={cn(
        "size-4 shrink-0",
        type === "personal" ? "text-personal" : "text-household",
        className,
      )}
    />
  );
}

function triggerClasses(type: SpaceType) {
  return cn(
    "inline-flex h-11 w-full max-w-44 items-center md:max-w-none gap-2 rounded-full border border-border px-3 text-small font-medium text-foreground transition-colors duration-150 ease-out",
    type === "personal" ? "bg-personal-subtle" : "bg-household-subtle",
  );
}

export function SpaceSwitcher({
  spaces,
  activeSpaceId,
  onSelect,
  createHouseholdHref = "/household/new",
  variant = "default",
}: SpaceSwitcherProps) {
  const [sheetOpen, setSheetOpen] = React.useState(false);
  const active = spaces.find((s) => s.id === activeSpaceId) ?? spaces[0];
  const hasHousehold = spaces.some((s) => s.type === "household");
  const footerLabel = hasHousehold ? "Manage household" : "Create a household";
  const accessibleName = `Active space: ${active.name}. Switch space.`;

  const triggerContent = (shortName: string) => (
    <>
      <SpaceIcon type={active.type} />
      <span className="truncate">{shortName}</span>
      <ChevronDown aria-hidden="true" className="size-4 shrink-0 text-muted-foreground" />
    </>
  );

  return (
    <>
      {/* Phone: bottom sheet. Hidden from md up. */}
      <div className="min-w-0 md:hidden">
        <Sheet open={sheetOpen} onOpenChange={setSheetOpen}>
          <SheetTrigger
            aria-label={accessibleName}
            title={active.name}
            className={triggerClasses(active.type)}
            data-testid="space-switcher-sheet-trigger"
          >
            {triggerContent(variant === "compact" ? truncate(active.name, 14) : active.name)}
          </SheetTrigger>
          <SheetContent side="bottom" className="rounded-t-xl pb-[env(safe-area-inset-bottom)]">
            <SheetHeader>
              <SheetTitle className="text-h3">Switch space</SheetTitle>
            </SheetHeader>
            <div role="radiogroup" aria-label="Spaces" className="px-2">
              {spaces.map((space) => {
                const checked = space.id === active.id;
                return (
                  <button
                    key={space.id}
                    type="button"
                    role="radio"
                    aria-checked={checked}
                    onClick={() => {
                      onSelect(space.id);
                      setSheetOpen(false);
                    }}
                    className="flex min-h-14 w-full items-center gap-3 rounded-md px-3 text-left text-body hover:bg-accent"
                  >
                    <SpaceIcon type={space.type} />
                    <span className="flex-1">
                      <span className="block text-body-strong">{space.name}</span>
                      {space.role ? (
                        <span className="block text-small text-muted-foreground">
                          {ROLE_LABEL[space.role]}
                        </span>
                      ) : null}
                    </span>
                    {checked ? <Check aria-hidden="true" className="size-5" /> : null}
                  </button>
                );
              })}
            </div>
            <div className="border-t border-border px-2 pb-3 pt-2">
              <Link
                href={createHouseholdHref}
                onClick={() => setSheetOpen(false)}
                className="flex min-h-11 items-center rounded-md px-3 text-body font-medium text-primary hover:bg-accent"
              >
                {footerLabel}
              </Link>
            </div>
          </SheetContent>
        </Sheet>
      </div>

      {/* Tablet and desktop: dropdown menu. Hidden below md. */}
      <div className="hidden md:block">
        <DropdownMenu>
          <DropdownMenuTrigger
            aria-label={accessibleName}
            title={active.name}
            className={triggerClasses(active.type)}
            data-testid="space-switcher-menu-trigger"
          >
            {triggerContent(active.name)}
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-70 shadow-level-2">
            <DropdownMenuGroup>
              <DropdownMenuLabel className="px-2 py-2">
                <SpaceBadge
                  type={active.type}
                  label={active.type === "personal" ? "Personal" : "Household"}
                />
              </DropdownMenuLabel>
              <DropdownMenuRadioGroup value={active.id} onValueChange={(v) => onSelect(v as string)}>
                {spaces.map((space) => (
                  <DropdownMenuRadioItem key={space.id} value={space.id} className="min-h-11 gap-3 pl-2 text-body">
                    <SpaceIcon type={space.type} />
                    <span className="flex-1">
                      <span className="block">{space.name}</span>
                      {space.role ? (
                        <span className="block text-small text-muted-foreground">
                          {ROLE_LABEL[space.role]}
                        </span>
                      ) : null}
                    </span>
                  </DropdownMenuRadioItem>
                ))}
              </DropdownMenuRadioGroup>
            </DropdownMenuGroup>
            <DropdownMenuSeparator />
            <Link
              href={createHouseholdHref}
              className="flex min-h-11 items-center rounded-md px-2 text-body font-medium text-primary hover:bg-accent"
            >
              {footerLabel}
            </Link>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </>
  );
}
