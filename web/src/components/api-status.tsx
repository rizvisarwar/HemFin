import { createApiClient } from "@hemfin/api-client";
import { fetchApiStatus } from "@/lib/api-health";
import { API_URL } from "@/lib/env";
import { cn } from "@/lib/utils";

type Status = "online" | "offline" | "checking";

export function ApiStatusBadge({ status }: { status: Status }) {
  return (
    <span
      data-testid="api-status"
      data-status={status}
      className={cn(
        "inline-flex items-center gap-2 rounded-full px-3 py-1 text-small font-medium",
        status === "online" && "bg-success-subtle text-success",
        status === "offline" && "bg-destructive-subtle text-destructive",
        status === "checking" && "bg-muted text-muted-foreground",
      )}
    >
      <span aria-hidden="true" className="size-2 rounded-full bg-current" />
      API status: {status}
    </span>
  );
}

/** Server component. Never throws: an unreachable API just shows "offline". */
export async function ApiStatus() {
  const status = await fetchApiStatus(createApiClient(API_URL));
  return <ApiStatusBadge status={status} />;
}
