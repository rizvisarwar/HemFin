import type { ApiClient } from "@hemfin/api-client";

export type ApiHealthStatus = "online" | "offline";

export const HEALTH_TIMEOUT_MS = 2000;

/** Never throws: any failure (network error, timeout, non-2xx) is "offline". */
export async function fetchApiStatus(
  client: Pick<ApiClient, "GET">,
  timeoutMs: number = HEALTH_TIMEOUT_MS,
): Promise<ApiHealthStatus> {
  try {
    const { response } = await client.GET("/health", {
      cache: "no-store",
      signal: AbortSignal.timeout(timeoutMs),
    });
    return response.ok ? "online" : "offline";
  } catch {
    return "offline";
  }
}
