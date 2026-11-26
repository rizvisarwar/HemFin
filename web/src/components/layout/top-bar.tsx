"use client";

import Link from "next/link";
import { Bell, LogOut } from "lucide-react";
import { signOut } from "@/app/auth/actions";
import { clearHemfinSession } from "@/lib/households/flash";
import { cn } from "@/lib/utils";
import { Logo } from "./logo";
import { SpaceSwitcher } from "./space-switcher";
import type { SpaceSummary } from "./types";

export interface TopBarProps {
  spaces: SpaceSummary[];
  activeSpaceId: string;
  onSpaceChange: (spaceId: string) => void;
  notificationCount?: number; // shows a badge when > 0
  notificationsHref: string; // "/notifications"
  createHouseholdHref?: string;
}

export function TopBar({
  spaces,
  activeSpaceId,
  onSpaceChange,
  notificationCount = 0,
  notificationsHref,
  createHouseholdHref,
}: TopBarProps) {
  const active = spaces.find((s) => s.id === activeSpaceId) ?? spaces[0];
  const bellLabel =
    notificationCount > 0 ? `Notifications, ${notificationCount} unread` : "Notifications";

  return (
    <header
      data-space={active.type}
      data-viewport-inset="top" // overlays such as the combobox list keep clear of this bar
      className={cn(
        // While the space switcher is open the bar rises above the bottom nav, so the phone sheet covers it.
        "sticky top-0 z-30 has-data-[switcher-open]:z-50 flex h-14 items-center justify-between gap-2 border-b-2 bg-background px-4 md:h-16 md:px-6 xl:px-8",
        active.type === "personal" ? "border-b-personal" : "border-b-household",
      )}
    >
      <Logo href="/dashboard" showWordmark={false} className="md:hidden" />
      <Logo href="/dashboard" className="hidden md:inline-flex" />
      <div className="flex min-w-0 items-center gap-2">
        <SpaceSwitcher
          spaces={spaces}
          activeSpaceId={activeSpaceId}
          onSelect={onSpaceChange}
          createHouseholdHref={createHouseholdHref}
        />
        <Link
          href={notificationsHref}
          aria-label={bellLabel}
          className="relative inline-flex size-11 shrink-0 items-center justify-center rounded-md text-foreground hover:bg-accent"
        >
          <Bell aria-hidden="true" className="size-5" />
          {notificationCount > 0 ? (
            <span
              aria-hidden="true"
              className="absolute right-1 top-1 inline-flex min-w-5 items-center justify-center rounded-full bg-destructive px-1 text-caption text-destructive-foreground"
            >
              {notificationCount > 99 ? "99+" : notificationCount}
            </span>
          ) : null}
        </Link>
        {/* Household names and one-time messages kept for this tab are wiped as the account leaves. */}
        <form action={signOut} onSubmit={clearHemfinSession}>
          <button
            type="submit"
            aria-label="Sign out"
            title="Sign out"
            className="inline-flex size-11 shrink-0 items-center justify-center rounded-md text-foreground hover:bg-accent"
          >
            <LogOut aria-hidden="true" className="size-5" />
          </button>
        </form>
      </div>
    </header>
  );
}
