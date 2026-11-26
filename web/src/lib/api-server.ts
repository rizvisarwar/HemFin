import "server-only";
import { createApiClient } from "@hemfin/api-client";
import { API_URL } from "@/lib/env";
import { createClient } from "@/lib/supabase/server";
import type { MeResponse } from "@/lib/api";

/**
 * API client for Server Components: sends the session's access token. The token is only
 * forwarded; the API verifies it on every call, so nothing here is trusted as identity.
 */
export async function createServerApi() {
  const supabase = await createClient();
  // getSession() on the server reads the cookie without verifying it, which is fine here: it only
  // forwards the token, and the API verifies the signature on every call. Never use it for an
  // access decision in the web app (the proxy uses getClaims() for its optimistic check).
  return createApiClient(API_URL, async () => (await supabase.auth.getSession()).data.session?.access_token);
}

/** The signed-in user with their spaces, or null when the API cannot be reached or rejects the token. */
export async function fetchMe(): Promise<MeResponse | null> {
  try {
    const api = await createServerApi();
    const { data, response } = await api.GET("/api/v1/me", {
      cache: "no-store",
      signal: AbortSignal.timeout(4000),
    });
    return response.ok && data ? data : null;
  } catch {
    return null;
  }
}
