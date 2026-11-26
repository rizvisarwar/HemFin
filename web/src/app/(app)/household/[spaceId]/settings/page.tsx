import { Suspense } from "react";
import type { Metadata } from "next";
import { connection } from "next/server";
import { SettingsView } from "@/components/households/settings-view";
import { RetryButton } from "@/components/profile/retry-button";
import { FormMessage } from "@/components/ui/form-message";
import { Skeleton } from "@/components/ui/skeleton";
import { fetchMe, fetchSpace } from "@/lib/api-server";

export const metadata: Metadata = { title: "Household settings" };

async function SettingsContent({ params }: { params: Promise<{ spaceId: string }> }) {
  await connection();
  const { spaceId } = await params;
  const [lookup, me] = await Promise.all([fetchSpace(spaceId), fetchMe()]);
  if (lookup.status !== "ok" || lookup.space.type !== "household") return null; // the layout shows the not-found or error state
  if (!me) {
    return (
      <div data-testid="settings-error">
        <FormMessage kind="error">We could not load these settings just now.</FormMessage>
        <RetryButton />
      </div>
    );
  }
  return <SettingsView spaceId={spaceId} name={lookup.space.name} viewerId={me.id} viewerRole={lookup.space.role} />;
}

function SettingsFallback() {
  return (
    <div className="max-w-[640px] space-y-4" aria-busy="true">
      <p className="sr-only" role="status">
        Loading settings
      </p>
      <Skeleton className="h-40 w-full" />
      <Skeleton className="h-40 w-full" />
      <Skeleton className="h-40 w-full" />
    </div>
  );
}

export default function SettingsPage({ params }: { params: Promise<{ spaceId: string }> }) {
  return (
    <Suspense fallback={<SettingsFallback />}>
      <SettingsContent params={params} />
    </Suspense>
  );
}
