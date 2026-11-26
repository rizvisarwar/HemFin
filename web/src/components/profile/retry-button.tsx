"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";

/** Loads the page's data again (re-renders the server components). */
export function RetryButton() {
  const router = useRouter();
  const [pending, startTransition] = React.useTransition();
  return (
    <Button
      type="button"
      variant="outline"
      className="mt-3 w-full sm:w-auto"
      aria-busy={pending || undefined}
      disabled={pending}
      onClick={() => startTransition(() => router.refresh())}
    >
      {pending ? "Retrying…" : "Retry"}
    </Button>
  );
}
