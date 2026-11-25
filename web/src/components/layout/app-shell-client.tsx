"use client";

import * as React from "react";
import { usePathname, useRouter } from "next/navigation";
import { setActiveSpace } from "@/app/actions";
import { AppShell } from "./app-shell";
import { NAV_ITEMS } from "./nav-items";
import type { SpaceSummary } from "./types";

const ActiveSpaceContext = React.createContext<SpaceSummary | null>(null);

/** The active space, for client components inside the (app) shell. */
export function useActiveSpace(): SpaceSummary {
  const space = React.useContext(ActiveSpaceContext);
  if (!space) throw new Error("useActiveSpace must be used inside the app shell");
  return space;
}

/** Wires AppShell to the router, the current path and the space cookie. */
export function AppShellClient({
  children,
  spaces,
  initialSpaceId,
}: {
  children: React.ReactNode;
  spaces: SpaceSummary[];
  initialSpaceId: string;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const [activeId, setActiveId] = React.useState(initialSpaceId);
  const [, startTransition] = React.useTransition();
  const active = spaces.find((s) => s.id === activeId) ?? spaces[0];

  function onSpaceChange(id: string) {
    setActiveId(id);
    startTransition(async () => {
      await setActiveSpace(id);
      router.refresh();
    });
  }

  return (
    <ActiveSpaceContext.Provider value={active}>
      <AppShell
        spaces={spaces}
        activeSpaceId={active.id}
        onSpaceChange={onSpaceChange}
        navItems={NAV_ITEMS}
        currentPath={pathname}
      >
        {children}
      </AppShell>
    </ActiveSpaceContext.Provider>
  );
}
