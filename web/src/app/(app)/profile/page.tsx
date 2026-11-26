import { Suspense } from "react";
import type { Metadata } from "next";
import { connection } from "next/server";
import { AppPageHeader } from "@/components/layout/app-page-header";
import { AddressesSection } from "@/components/profile/addresses-section";
import { DangerZone } from "@/components/profile/danger-zone";
import { ProfileForm } from "@/components/profile/profile-form";
import { Skeleton } from "@/components/ui/skeleton";
import { fetchAddresses, fetchMe, fetchProfile } from "@/lib/api-server";

export const metadata: Metadata = { title: "Profile" };

async function ProfileContent() {
  // Request-time work (session, API calls) must come after a dynamic API (see HEM-007).
  await connection();
  const [me, profile, addresses] = await Promise.all([fetchMe(), fetchProfile(), fetchAddresses()]);
  if (!me || !profile || !addresses) {
    return (
      <p role="alert" className="rounded-md bg-destructive-subtle px-3 py-2 text-body text-destructive">
        We could not load your profile just now. Reload the page to try again.
      </p>
    );
  }
  return (
    <div className="max-w-3xl space-y-8">
      <ProfileForm email={me.email} displayName={profile.display_name} profile={profile} />
      <AddressesSection initial={addresses} />
      <DangerZone />
    </div>
  );
}

function ProfileFallback() {
  return (
    <div className="max-w-3xl space-y-4" aria-busy="true">
      <Skeleton className="h-80 w-full" />
      <Skeleton className="h-40 w-full" />
    </div>
  );
}

export default function ProfilePage() {
  return (
    <>
      <AppPageHeader title="Profile" description="Your details, currency and addresses." />
      <Suspense fallback={<ProfileFallback />}>
        <ProfileContent />
      </Suspense>
    </>
  );
}
