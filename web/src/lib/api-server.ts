import "server-only";
import { cache } from "react";
import { createApiClient } from "@hemfin/api-client";
import { API_URL } from "@/lib/env";
import { createClient } from "@/lib/supabase/server";
import type { AddressResponse, MeResponse, ProfileResponse } from "@/lib/api";

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

/**
 * The signed-in user with their spaces, or null when the API cannot be reached or rejects the token.
 * Wrapped in React cache(): one request per render, shared by the layout and the page.
 */
export const fetchMe = cache(async (): Promise<MeResponse | null> => {
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
});

/**
 * The user's profile (base currency, locale, phone), or null when the API cannot be reached.
 * Wrapped in React cache(), so the (app) layout and the page share one request per render.
 */
export const fetchProfile = cache(async (): Promise<ProfileResponse | null> => {
  try {
    const api = await createServerApi();
    const { data, response } = await api.GET("/api/v1/me/profile", {
      cache: "no-store",
      signal: AbortSignal.timeout(4000),
    });
    return response.ok && data ? data : null;
  } catch {
    return null;
  }
});

/** The user's saved addresses (default first), or null when the API cannot be reached. */
export async function fetchAddresses(): Promise<AddressResponse[] | null> {
  try {
    const api = await createServerApi();
    const { data, response } = await api.GET("/api/v1/me/addresses", {
      cache: "no-store",
      signal: AbortSignal.timeout(4000),
    });
    return response.ok && data ? data : null;
  } catch {
    return null;
  }
}
