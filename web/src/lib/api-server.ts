import "server-only";
import { cache } from "react";
import { createApiClient } from "@hemfin/api-client";
import { API_URL } from "@/lib/env";
import { createClient } from "@/lib/supabase/server";
import type {
  AddressResponse,
  MeResponse,
  MemberResponse,
  ProfileResponse,
  SpaceDetail,
  SpaceListItem,
} from "@/lib/api";

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

/** Upper bound on pages read for a list, so a misbehaving API can never loop forever. */
const MAX_PAGES = 10;

/**
 * Every space the user belongs to, with member counts (all pages), or null when the API cannot be
 * reached. Wrapped in React cache(): one request per render.
 */
export const fetchSpaces = cache(async (): Promise<SpaceListItem[] | null> => {
  try {
    const api = await createServerApi();
    const items: SpaceListItem[] = [];
    let cursor: string | undefined;
    for (let page = 0; page < MAX_PAGES; page++) {
      const { data, response } = await api.GET("/api/v1/spaces", {
        params: { query: { limit: 100, cursor } },
        cache: "no-store",
        signal: AbortSignal.timeout(4000),
      });
      if (!response.ok || !data) return null;
      items.push(...data.items);
      if (!data.next_cursor) return items;
      cursor = data.next_cursor;
    }
    return items;
  } catch {
    return null;
  }
});

export type SpaceLookup =
  | { status: "ok"; space: SpaceDetail }
  /** Missing space or not a member: the same answer, so the page never says which. */
  | { status: "not-found" }
  | { status: "error" };

/** One space the user is a member of. A 404 or a malformed id is "not-found"; anything else is "error". */
export const fetchSpace = cache(async (spaceId: string): Promise<SpaceLookup> => {
  try {
    const api = await createServerApi();
    const { data, response } = await api.GET("/api/v1/spaces/{space_id}", {
      params: { path: { space_id: spaceId } },
      cache: "no-store",
      signal: AbortSignal.timeout(4000),
    });
    if (response.ok && data) return { status: "ok", space: data };
    if (response.status === 404 || response.status === 422) return { status: "not-found" };
    return { status: "error" };
  } catch {
    return { status: "error" };
  }
});

/** Every member of a space (all pages), or null when the API cannot be reached. */
export const fetchMembers = cache(async (spaceId: string): Promise<MemberResponse[] | null> => {
  try {
    const api = await createServerApi();
    const items: MemberResponse[] = [];
    let cursor: string | undefined;
    for (let page = 0; page < MAX_PAGES; page++) {
      const { data, response } = await api.GET("/api/v1/spaces/{space_id}/members", {
        params: { path: { space_id: spaceId }, query: { limit: 100, cursor } },
        cache: "no-store",
        signal: AbortSignal.timeout(4000),
      });
      if (!response.ok || !data) return null;
      items.push(...data.items);
      if (!data.next_cursor) return items;
      cursor = data.next_cursor;
    }
    return items;
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
