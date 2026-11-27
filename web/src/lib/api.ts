import { createApiClient, type components } from "@hemfin/api-client";
import { API_URL } from "@/lib/env";

export type MeResponse = components["schemas"]["MeOut"];
export type ProfileResponse = components["schemas"]["ProfileOut"];
export type AddressResponse = components["schemas"]["AddressOut"];
export type SpaceListItem = components["schemas"]["SpaceListItem"];
export type SpaceDetail = components["schemas"]["SpaceOut"];
export type MemberResponse = components["schemas"]["MemberOut"];
export type InvitationResponse = components["schemas"]["InvitationOut"];
export type InvitationPreview = components["schemas"]["InvitationPreview"];
export type InvitationAccepted = components["schemas"]["InvitationAccepted"];
export type ContractResponse = components["schemas"]["ContractOut"];
export type CategoryResponse = components["schemas"]["CategoryOut"];
export type Role = components["schemas"]["Role"];
export type DashboardResponse = components["schemas"]["DashboardOut"];
export type DashboardEventResponse = components["schemas"]["DashboardEvent"];

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
