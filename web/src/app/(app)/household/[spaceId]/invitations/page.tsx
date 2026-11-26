import { Suspense } from "react";
import type { Metadata } from "next";
import { connection } from "next/server";
import { redirect } from "next/navigation";
import { Mail } from "lucide-react";
import { EmptyState } from "@/components/ui/empty-state";
import { HemCard } from "@/components/ui/hem-card";
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
  // HEM-016 builds the invite form, the invitation list, resend and revoke here. Until then this is a
  // placeholder with no invitation behaviour.
  return (
    <HemCard data-testid="invitations-placeholder">
      <EmptyState
        variant="inline"
        icon={Mail}
        titleAs="h2"
        title="Invitations are coming soon"
        description="You will be able to invite a partner or family member by email from this page."
      />
    </HemCard>
  );
}

export default function InvitationsPage({ params }: { params: Promise<{ spaceId: string }> }) {
  return (
    <Suspense fallback={<Skeleton className="h-32 w-full" aria-busy="true" />}>
      <InvitationsContent params={params} />
    </Suspense>
  );
}
