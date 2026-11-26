import { Suspense } from "react";
import type { Metadata } from "next";
import { connection } from "next/server";
import { PageHeader } from "@/components/layout/page-header";
import { AddressesSection } from "@/components/profile/addresses-section";
import { DangerZone } from "@/components/profile/danger-zone";
import { ProfileForm } from "@/components/profile/profile-form";
import { RetryButton } from "@/components/profile/retry-button";
import { Skeleton } from "@/components/ui/skeleton";
import { fetchAddresses, fetchMe, fetchProfile } from "@/lib/api-server";

export const metadata: Metadata = { title: "Profile" };

async function ProfileContent() {
  // Request-time work (session, API calls) must come after a dynamic API (see HEM-007).
  await connection();
  // fetchMe and fetchProfile are cached per request, so the (app) layout's calls are reused here.
  const [me, profile, addresses] = await Promise.all([fetchMe(), fetchProfile(), fetchAddresses()]);
  if (!me || !profile || !addresses) {
    return (
      <div role="alert" className="max-w-3xl rounded-md bg-destructive-subtle px-3 py-3 text-body text-destructive">
        <p>We could not load your profile just now. Reload the page to try again.</p>
        <RetryButton />
      </div>
    );
  }
  return (
    <div className="max-w-3xl space-y-8">
      <ProfileForm email={me.email} displayName={me.display_name} profile={profile} />
      <AddressesSection initial={addresses} />
      <DangerZone />
    </div>
  );
}

function ProfileFallback() {
  return (
    <div className="max-w-3xl space-y-4" aria-busy="true">
      <p className="sr-only" role="status">
        Loading your profile
      </p>
      <Skeleton className="h-80 w-full" />
      <Skeleton className="h-40 w-full" />
    </div>
  );
}

export default function ProfilePage() {
  return (
    <>
      {/* Account-level page: no space badge (docs/design/profile.md, app-shell.md section 5). */}
      <PageHeader title="Profile" description="Your details, currency and addresses." />
      <Suspense fallback={<ProfileFallback />}>
        <ProfileContent />
      </Suspense>
    </>
  );
}
