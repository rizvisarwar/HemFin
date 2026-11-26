import { Suspense } from "react";
import { connection } from "next/server";
import { HouseholdNotFound } from "@/components/households/household-not-found";
import { SectionNav } from "@/components/households/section-nav";
import { PageHeader } from "@/components/layout/page-header";
import { RetryButton } from "@/components/profile/retry-button";
import { FormMessage } from "@/components/ui/form-message";
import { Skeleton } from "@/components/ui/skeleton";
import { fetchSpace } from "@/lib/api-server";
import { canInvite } from "@/lib/households/households";

async function HouseholdFrame({ params, children }: { params: Promise<{ spaceId: string }>; children: React.ReactNode }) {
  // Request-time work (session, API call) must come after a dynamic API (see HEM-007).
  await connection();
  const { spaceId } = await params;
  const lookup = await fetchSpace(spaceId);
  // A missing household, a household the user is not in and a personal space are the same screen.
  if (lookup.status === "not-found" || (lookup.status === "ok" && lookup.space.type !== "household")) {
    // The pages render nothing in this case (they look the space up too); children stay in the tree so
    // Next can validate every segment.
    return (
      <>
        <HouseholdNotFound />
        {children}
      </>
    );
  }
  if (lookup.status === "error") {
    return (
      <>
        <PageHeader title="Household" backLink={{ label: "Households", href: "/household" }} />
        <div data-testid="household-error">
          <FormMessage kind="error">We could not load this household just now.</FormMessage>
          <RetryButton />
        </div>
        {children}
      </>
    );
  }
  const { space } = lookup;
  return (
    <>
      <PageHeader
        title={space.name}
        space="household"
        spaceName={space.name}
        backLink={{ label: "Households", href: "/household" }}
      />
      <SectionNav spaceId={space.id} showInvitations={canInvite(space.role)} />
      {children}
    </>
  );
}

function FrameFallback() {
  return (
    <div aria-busy="true">
      <p className="sr-only" role="status">
        Loading household
      </p>
      <Skeleton className="mb-2 h-8 w-48" />
      <Skeleton className="mb-6 h-7 w-40" />
      <Skeleton className="h-11 w-full max-w-sm" />
    </div>
  );
}

export default function HouseholdLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ spaceId: string }>;
}) {
  return (
    <Suspense fallback={<FrameFallback />}>
      <HouseholdFrame params={params}>{children}</HouseholdFrame>
    </Suspense>
  );
}
