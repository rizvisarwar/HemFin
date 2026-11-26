import { Suspense } from "react";
import { cookies } from "next/headers";
import { connection } from "next/server";
import { AppShellClient } from "@/components/layout/app-shell-client";
import { ApiUnavailable } from "@/components/layout/api-unavailable";
import type { SpaceSummary } from "@/components/layout/types";
import { Skeleton } from "@/components/ui/skeleton";
import { FormatProvider } from "@/components/format-provider";
import { fetchMe, fetchProfile } from "@/lib/api-server";
import { DEFAULT_PREFS } from "@/lib/format";
import { isUsableLocale } from "@/lib/profile/locales";
import { resolveSpaceId, SPACE_COOKIE } from "@/lib/space";

async function ShellWithSpace({ children }: { children: React.ReactNode }) {
  // Request-time work (session, API call, timeouts) must come after a dynamic API (see HEM-007).
  await connection();
  // The user's real spaces come from the API (the first call also provisions a new user).
  const [me, profile] = await Promise.all([fetchMe(), fetchProfile()]);
  if (!me || me.spaces.length === 0) return <ApiUnavailable />;
  const spaces: SpaceSummary[] = me.spaces.map((s) => ({ id: s.id, name: s.name, type: s.type, role: s.role }));
  // The active space is read from the cookie so the server renders it first time.
  const jar = await cookies();
  const saved = jar.get(SPACE_COOKIE)?.value;
  const initialSpaceId = resolveSpaceId(saved, spaces);
  // A saved space the user can no longer open: the shell shows the personal space and says so.
  const staleSpaceId = saved && !spaces.some((s) => s.id === saved) ? saved : undefined;
  // Base currency and locale for every amount shown in the app. A missing or unusable profile
  // falls back to the defaults rather than blocking the page.
  const prefs = {
    currency: profile?.base_currency ?? DEFAULT_PREFS.currency,
    locale: profile && isUsableLocale(profile.locale) ? profile.locale : DEFAULT_PREFS.locale,
  };
  return (
    <FormatProvider prefs={prefs}>
      <AppShellClient userId={me.id} spaces={spaces} initialSpaceId={initialSpaceId} staleSpaceId={staleSpaceId}>
        {children}
      </AppShellClient>
    </FormatProvider>
  );
}

function ShellFallback() {
  return (
    <div className="min-h-dvh" aria-busy="true">
      <div className="h-14 border-b-2 border-border md:h-16" />
      <div className="space-y-4 px-4 pt-6 md:px-6 md:pl-24 xl:px-8 xl:pl-72">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-32 w-full" />
      </div>
    </div>
  );
}

export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <Suspense fallback={<ShellFallback />}>
      <ShellWithSpace>{children}</ShellWithSpace>
    </Suspense>
  );
}
