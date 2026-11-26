import { Suspense } from "react";
import type { Metadata } from "next";
import { connection } from "next/server";
import { redirect } from "next/navigation";
import { InvitationsView } from "@/components/invitations/invitations-view";
import { Skeleton } from "@/components/ui/skeleton";
import { fetchSpace } from "@/lib/api-server";
import { canInvite } from "@/lib/households/households";

export const metadata: Metadata = { title: "Invitations" };

async function InvitationsContent({ params }: { params: Promise<{ spaceId: string }> }) {
  await connection();
  const { spaceId } = await params;
  const lookup = await fetchSpace(spaceId);
  if (lookup.status !== "ok" || lookup.space.type !== "household") return null; // the layout shows the not-found or error state
  // Members cannot invite (the API would answer 403), so they are sent to Members (D4).
  if (!canInvite(lookup.space.role)) redirect(`/household/${spaceId}/members`);
  // The form shows at once; the list reads its first page in the browser, so its own loading state shows.
  return <InvitationsView spaceId={spaceId} />;
}

export default function InvitationsPage({ params }: { params: Promise<{ spaceId: string }> }) {
  return (
    <Suspense fallback={<Skeleton className="h-32 w-full" aria-busy="true" />}>
      <InvitationsContent params={params} />
    </Suspense>
  );
}
