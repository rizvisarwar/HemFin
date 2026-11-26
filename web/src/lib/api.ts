import { createApiClient, type components } from "@hemfin/api-client";
import { API_URL } from "@/lib/env";

export type MeResponse = components["schemas"]["MeOut"];

/**
 * Browser API client: sends the current Supabase access token with every request. Import from
 * Client Components only.
 */
export async function createBrowserApi() {
  const { createClient } = await import("@/lib/supabase/client");
  const supabase = createClient();
  // getSession() only reads the stored session so its token can be forwarded as a Bearer header.
  // It is not an authorization decision: the API verifies the token's signature on every call.
  return createApiClient(API_URL, async () => (await supabase.auth.getSession()).data.session?.access_token);
}
