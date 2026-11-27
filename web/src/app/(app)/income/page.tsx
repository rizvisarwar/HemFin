import { Suspense } from "react";
import type { Metadata } from "next";
import { IncomeView } from "@/components/income/income-view";
import { Skeleton } from "@/components/ui/skeleton";

export const metadata: Metadata = { title: "Income" };

export default function IncomePage() {
  // useSearchParams (`?new=1`) needs a Suspense boundary.
  return (
    <Suspense fallback={<Skeleton className="h-32 w-full" aria-busy="true" />}>
      <IncomeView />
    </Suspense>
  );
}
