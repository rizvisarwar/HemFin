import { Suspense } from "react";
import type { Metadata } from "next";
import Link from "next/link";
import { connection } from "next/server";
import { ChevronRight, Lock, Plus, Users } from "lucide-react";
import { FlashMessage } from "@/components/households/flash-message";
import { PageHeader } from "@/components/layout/page-header";
import { RetryButton } from "@/components/profile/retry-button";
import { buttonVariants } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { FormMessage } from "@/components/ui/form-message";
import { HemCard } from "@/components/ui/hem-card";
import { RoleBadge } from "@/components/ui/status-chip";
import { Skeleton } from "@/components/ui/skeleton";
import { fetchSpaces } from "@/lib/api-server";
import { compareNames, memberCountLabel, ROLE_LABEL } from "@/lib/households/households";

export const metadata: Metadata = { title: "Households" };

function CreateButton() {
  return (
    // A real link (navigation), dressed as a button.
    <Link href="/household/new" className={buttonVariants()}>
      <Plus aria-hidden="true" />
      Create a household
    </Link>
  );
}

/** The personal space is not a household. This card explains why it is not listed. */
function PersonalCard() {
  return (
    <HemCard variant="muted" data-testid="personal-card">
      <div className="flex items-start gap-3">
        <Lock aria-hidden="true" className="mt-1 size-5 shrink-0 text-personal" />
        <div className="min-w-0">
          <h2 className="text-h3">Personal</h2>
          <p className="mt-1 text-body text-muted-foreground">Only you can see it. It is not listed here.</p>
        </div>
      </div>
    </HemCard>
  );
}

async function HouseholdList() {
  // Request-time work (session, API call) must come after a dynamic API (see HEM-007).
  await connection();
  const spaces = await fetchSpaces();
  if (!spaces) {
    return (
      <div data-testid="list-error">
        <FormMessage kind="error">We could not load your households just now.</FormMessage>
        <RetryButton />
      </div>
    );
  }
  const households = spaces.filter((s) => s.type === "household").sort((a, b) => compareNames(a.name, b.name));
  if (households.length === 0) {
    return (
      <EmptyState
        icon={Users}
        title="Share finances with family"
        description="Create a household, then invite a partner or family member by email. They see only what the household shares."
        primaryAction={{ label: "Create a household", href: "/household/new" }}
      />
    );
  }
  return (
    <section aria-labelledby="households-heading">
      <h2 id="households-heading" className="sr-only">
        Your households
      </h2>
      <ul className="grid gap-3 md:grid-cols-2" data-testid="household-list">
        {households.map((h) => (
          <li key={h.id} className="min-w-0">
            <HemCard variant="interactive" space="household" padding="none" className="h-full">
              <Link
                href={`/household/${h.id}/members`}
                aria-label={`${h.name}, ${ROLE_LABEL[h.role]}`}
                className="flex min-h-14 items-center gap-3 rounded-lg p-4 md:p-5"
              >
                <div className="min-w-0 flex-1">
                  <h3 className="line-clamp-2 break-words text-h3">{h.name}</h3>
                  <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1">
                    <RoleBadge role={h.role} />
                    <span className="text-small text-muted-foreground">{memberCountLabel(h.member_count)}</span>
                  </div>
                </div>
                <ChevronRight aria-hidden="true" className="size-5 shrink-0 text-muted-foreground" />
              </Link>
            </HemCard>
          </li>
        ))}
      </ul>
    </section>
  );
}

function ListFallback() {
  return (
    <div aria-busy="true" data-testid="list-loading">
      <p className="sr-only" role="status">
        Loading your households
      </p>
      <div className="grid gap-3 md:grid-cols-2">
        <Skeleton className="h-[5.5rem] w-full" />
        <Skeleton className="h-[5.5rem] w-full" />
      </div>
    </div>
  );
}

export default function HouseholdsPage() {
  return (
    <>
      {/* The list spans spaces, so it has no space badge (docs/design/households.md D15). */}
      <PageHeader
        title="Households"
        description="Shared finances with family. Personal records are never shared."
        primaryAction={<CreateButton />}
      />
      <FlashMessage />
      <div className="mb-4">
        <PersonalCard />
      </div>
      <Suspense fallback={<ListFallback />}>
        <HouseholdList />
      </Suspense>
    </>
  );
}
