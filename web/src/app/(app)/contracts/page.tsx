import { Suspense } from "react";
import type { Metadata } from "next";
import { ContractsView } from "@/components/contracts/contracts-view";
import { Skeleton } from "@/components/ui/skeleton";

export const metadata: Metadata = { title: "Contracts" };

export default function ContractsPage() {
  // useSearchParams (the `?new=1` link) needs a Suspense boundary.
  return (
    <Suspense fallback={<Skeleton className="h-32 w-full" aria-busy="true" />}>
      <ContractsView />
    </Suspense>
  );
}
