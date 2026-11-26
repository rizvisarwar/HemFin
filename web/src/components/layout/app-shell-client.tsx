"use client";

import * as React from "react";
import { usePathname, useRouter } from "next/navigation";
import { setActiveSpace } from "@/app/actions";
import { ToastProvider, useToast } from "@/components/ui/toast";
import { recallSpaceName, rememberSpaceNames } from "@/lib/households/flash";
import { AppShell } from "./app-shell";
import { NAV_ITEMS } from "./nav-items";
import type { SpaceSummary } from "./types";

const ActiveSpaceContext = React.createContext<SpaceSummary | null>(null);
const SpacesContext = React.createContext<SpaceSummary[] | null>(null);

/** The active space, for client components inside the (app) shell. */
export function useActiveSpace(): SpaceSummary {
  const space = React.useContext(ActiveSpaceContext);
  if (!space) throw new Error("useActiveSpace must be used inside the app shell");
  return space;
}

/** Every space the user belongs to (personal first), for client components inside the (app) shell. */
export function useSpaces(): SpaceSummary[] {
  const spaces = React.useContext(SpacesContext);
  if (!spaces) throw new Error("useSpaces must be used inside the app shell");
  return spaces;
}

/** The household id in `/household/<id>/...`, or null on other pages (and on `/household/new`). */
function householdPageId(pathname: string): string | null {
  const m = /^\/household\/([^/]+)/.exec(pathname);
  return m && m[1] !== "new" ? m[1] : null;
}

/**
 * Wires AppShell to the router, the current path and the space cookie.
 *
 * `staleSpaceId` is set by the layout when the saved space cookie names a space the user can no
 * longer open. The layout already fell back to the personal space; here the cookie is rewritten and
 * a toast says what happened.
 */
export function AppShellClient({
  children,
  spaces,
  initialSpaceId,
  staleSpaceId,
}: {
  children: React.ReactNode;
  spaces: SpaceSummary[];
  initialSpaceId: string;
  staleSpaceId?: string;
}) {
  return (
    <ToastProvider>
      <ShellInner spaces={spaces} initialSpaceId={initialSpaceId} staleSpaceId={staleSpaceId}>
        {children}
      </ShellInner>
    </ToastProvider>
  );
}

function ShellInner({
  children,
  spaces,
  initialSpaceId,
  staleSpaceId,
}: {
  children: React.ReactNode;
  spaces: SpaceSummary[];
  initialSpaceId: string;
  staleSpaceId?: string;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const toast = useToast();
  const [activeId, setActiveId] = React.useState(initialSpaceId);
  const [seenInitial, setSeenInitial] = React.useState(initialSpaceId);
  const [syncing, startTransition] = React.useTransition();
  // The server picked another space (a household was just created, or the saved one is gone): follow it.
  if (initialSpaceId !== seenInitial) {
    setSeenInitial(initialSpaceId);
    setActiveId(initialSpaceId);
  }
  const active = spaces.find((s) => s.id === activeId) ?? spaces.find((s) => s.id === initialSpaceId) ?? spaces[0];

  // Names this tab has seen, so a later "no longer has access" message can say which household.
  React.useEffect(() => {
    rememberSpaceNames(spaces);
  }, [spaces]);

  const handled = React.useRef<string | null>(null);
  React.useEffect(() => {
    if (!staleSpaceId || handled.current === staleSpaceId) return;
    handled.current = staleSpaceId;
    const name = recallSpaceName(staleSpaceId);
    toast(name ? `You no longer have access to ${name}.` : "You no longer have access to that household.");
    // Rewrite the cookie so the next page load does not report it again.
    startTransition(async () => {
      await setActiveSpace(initialSpaceId);
    });
  }, [staleSpaceId, initialSpaceId, toast]);

  function onSpaceChange(id: string) {
    setActiveId(id);
    const pageId = householdPageId(pathname);
    startTransition(async () => {
      await setActiveSpace(id);
      // A household page belongs to the household in its URL, so another space opens its dashboard (D12).
      if (pageId && pageId !== id) router.push("/dashboard");
      else router.refresh();
    });
  }

  return (
    <SpacesContext.Provider value={spaces}>
      <ActiveSpaceContext.Provider value={active}>
        {/* display: contents keeps the layout unchanged. data-space-sync lets tests wait until the
            space cookie is written and router.refresh() has finished. */}
        <div className="contents" data-space-sync={syncing ? "pending" : "idle"}>
          <AppShell
            spaces={spaces}
            activeSpaceId={active.id}
            onSpaceChange={onSpaceChange}
            navItems={NAV_ITEMS}
            currentPath={pathname}
          >
            {children}
          </AppShell>
        </div>
      </ActiveSpaceContext.Provider>
    </SpacesContext.Provider>
  );
}
