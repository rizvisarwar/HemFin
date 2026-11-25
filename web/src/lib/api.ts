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
  return createApiClient(API_URL, async () => (await supabase.auth.getSession()).data.session?.access_token);
}
