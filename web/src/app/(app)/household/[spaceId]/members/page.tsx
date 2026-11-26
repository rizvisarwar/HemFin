import { Suspense } from "react";
import type { Metadata } from "next";
import { connection } from "next/server";
import { MembersView } from "@/components/households/members-view";
import { RetryButton } from "@/components/profile/retry-button";
import { FormMessage } from "@/components/ui/form-message";
import { Skeleton } from "@/components/ui/skeleton";
import { fetchMe, fetchMembers, fetchSpace } from "@/lib/api-server";

export const metadata: Metadata = { title: "Members" };

async function MembersContent({ params }: { params: Promise<{ spaceId: string }> }) {
  await connection();
  const { spaceId } = await params;
  // The layout already looked the space up (cached per request), so this adds no request.
  const [lookup, members, me] = await Promise.all([fetchSpace(spaceId), fetchMembers(spaceId), fetchMe()]);
  if (lookup.status !== "ok" || lookup.space.type !== "household") return null; // the layout shows the not-found or error state
  if (!members || !me) {
    return (
      <div data-testid="members-error">
        <FormMessage kind="error">We could not load members just now.</FormMessage>
        <RetryButton />
      </div>
    );
  }
  return (
    <MembersView
      spaceId={spaceId}
      householdName={lookup.space.name}
      viewerId={me.id}
      viewerRole={lookup.space.role}
      members={members}
    />
  );
}

function MembersFallback() {
  return (
    <div aria-busy="true" data-testid="members-loading">
      <p className="sr-only" role="status">
        Loading members
      </p>
      <Skeleton className="mb-3 h-7 w-32" />
      <div className="space-y-3">
        <Skeleton className="h-24 w-full" />
        <Skeleton className="h-24 w-full" />
        <Skeleton className="h-24 w-full" />
      </div>
    </div>
  );
}

export default function MembersPage({ params }: { params: Promise<{ spaceId: string }> }) {
  return (
    <Suspense fallback={<MembersFallback />}>
      <MembersContent params={params} />
    </Suspense>
  );
}
