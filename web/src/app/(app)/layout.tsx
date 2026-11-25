import { Suspense } from "react";
import { cookies } from "next/headers";
import { AppShellClient } from "@/components/layout/app-shell-client";
import { Skeleton } from "@/components/ui/skeleton";
import { PLACEHOLDER_SPACES, resolveSpaceId, SPACE_COOKIE } from "@/lib/space";

async function ShellWithSpace({ children }: { children: React.ReactNode }) {
  // The active space is read from the cookie so the server renders it first time.
  const jar = await cookies();
  const initialSpaceId = resolveSpaceId(jar.get(SPACE_COOKIE)?.value);
  return (
    <AppShellClient spaces={PLACEHOLDER_SPACES} initialSpaceId={initialSpaceId}>
      {children}
    </AppShellClient>
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
