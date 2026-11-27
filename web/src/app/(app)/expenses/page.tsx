import { Suspense } from "react";
import type { Metadata } from "next";
import { ExpensesView } from "@/components/expenses/expenses-view";
import { Skeleton } from "@/components/ui/skeleton";

export const metadata: Metadata = { title: "Expenses" };

export default function ExpensesPage() {
  // useSearchParams (`?new=1`, `?contract_id=`) needs a Suspense boundary.
  return (
    <Suspense fallback={<Skeleton className="h-32 w-full" aria-busy="true" />}>
      <ExpensesView />
    </Suspense>
  );
}
