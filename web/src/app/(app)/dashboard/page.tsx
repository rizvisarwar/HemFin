import { Suspense } from "react";
import type { Metadata } from "next";
import { cookies } from "next/headers";
import { connection } from "next/server";
import { DashboardError, DashboardSkeleton, DashboardView } from "@/components/dashboard/dashboard-view";
import { RetryButton } from "@/components/profile/retry-button";
import { fetchDashboard, fetchMe } from "@/lib/api-server";
import { utcToday } from "@/lib/dashboard/dashboard";
import { resolveSpaceId, SPACE_COOKIE } from "@/lib/space";

export const metadata: Metadata = { title: "Dashboard" };

async function DashboardContent() {
  await connection();
  const me = await fetchMe(); // cached: the layout already made this request
  // The active space is the same one the shell resolves from the cookie.
  const jar = await cookies();
  const spaceId = me ? resolveSpaceId(jar.get(SPACE_COOKIE)?.value, me.spaces) : "";
  const data = spaceId ? await fetchDashboard(spaceId) : null;
  if (!data) {
    return (
      <>
        <DashboardError />
        <RetryButton />
      </>
    );
  }
  return <DashboardView data={data} today={utcToday()} />;
}

export default function DashboardPage() {
  return (
    <Suspense fallback={<DashboardSkeleton />}>
      <DashboardContent />
    </Suspense>
  );
}
