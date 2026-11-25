"use client";

import * as React from "react";
import { BottomNav } from "./bottom-nav";
import { BOTTOM_NAV_ITEMS, MORE_NAV_ITEMS } from "./nav-items";
import { SideNav } from "./side-nav";
import { TopBar } from "./top-bar";
import type { NavItem, SpaceSummary } from "./types";

export interface AppShellProps {
  children: React.ReactNode;
  spaces: SpaceSummary[];
  activeSpaceId: string;
  onSpaceChange: (spaceId: string) => void;
  navItems: NavItem[]; // all items, display order
  currentPath: string; // from usePathname() in the caller
  notificationCount?: number;
  createHouseholdHref?: string; // default "/household/new"
}

const ROLE_TEXT = { owner: "owner", admin: "admin", member: "member" } as const;

export function AppShell({
  children,
  spaces,
  activeSpaceId,
  onSpaceChange,
  navItems,
  currentPath,
  notificationCount = 0,
  createHouseholdHref = "/household/new",
}: AppShellProps) {
  const active = spaces.find((s) => s.id === activeSpaceId) ?? spaces[0];
  const items = navItems.map((i) =>
    i.key === "notifications" ? { ...i, badgeCount: notificationCount } : i,
  );
  const bottomItems = BOTTOM_NAV_ITEMS.map((b) => items.find((i) => i.key === b.key) ?? b);
  const moreItems = MORE_NAV_ITEMS.map((b) => items.find((i) => i.key === b.key) ?? b);
  const spaceNote = active.role
    ? `${active.type === "household" ? "Household" : "Personal"} ${ROLE_TEXT[active.role]}`
    : active.name;

  return (
    <div className="flex min-h-dvh flex-col">
      <a
        href="#main"
        className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-50 focus:rounded-md focus:bg-primary focus:px-4 focus:py-3 focus:text-primary-foreground"
      >
        Skip to content
      </a>
      <TopBar
        spaces={spaces}
        activeSpaceId={activeSpaceId}
        onSpaceChange={onSpaceChange}
        notificationCount={notificationCount}
        notificationsHref="/notifications"
        createHouseholdHref={createHouseholdHref}
      />
      <div className="flex flex-1">
        <SideNav items={items} currentPath={currentPath} spaceNote={spaceNote} />
        <main
          id="main"
          data-space={active.type}
          className="min-w-0 flex-1 px-4 pb-[calc(5rem+env(safe-area-inset-bottom))] pt-4 md:px-6 md:pb-8 md:pt-6 xl:px-8"
        >
          <div className="mx-auto w-full max-w-[1120px]">{children}</div>
        </main>
      </div>
      <BottomNav
        items={bottomItems}
        moreItems={moreItems}
        currentPath={currentPath}
        notificationCount={notificationCount}
      />
    </div>
  );
}
