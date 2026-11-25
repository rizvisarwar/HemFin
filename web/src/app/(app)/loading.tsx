import { Skeleton } from "@/components/ui/skeleton";

/** Shown inside the shell while a page loads. Same footprint as a PageHeader plus a card. */
export default function Loading() {
  return (
    <div aria-busy="true" aria-label="Loading">
      <Skeleton className="mb-2 h-8 w-48" />
      <Skeleton className="mb-6 h-6 w-72 max-w-full" />
      <Skeleton className="h-40 w-full" />
    </div>
  );
}
