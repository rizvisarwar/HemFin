import type { BrowserContext } from "@playwright/test";

export const MOCK = `http://127.0.0.1:${process.env.MOCK_PORT ?? 3199}`;
export const APP = "http://127.0.0.1:3100";
/** Supabase JS names the cookie after the first label of the project host: 127.0.0.1 gives "127". */
const COOKIE = "sb-127-auth-token";

export const USER = { email: "user@example.test" };
export const HOUSEHOLD_USER = { email: "household@example.test" };

/**
 * An email no other test uses, so tests that change the profile or addresses never share state
 * with another project or test running in parallel (the mock keeps state per user).
 */
export function uniqueUser(info: { project: { name: string }; titlePath: string[]; workerIndex: number }): { email: string } {
  const slug = info.titlePath.join("-").toLowerCase().replace(/[^a-z0-9]+/g, "-").slice(0, 60);
  return { email: `${info.project.name}-${slug}-${info.workerIndex}@example.test` };
}

/** Seeds the mock API's profile and addresses for a user (before they load a page). */
export async function seed(
  who: { email: string },
  data: {
    display_name?: string | null;
    profile?: Record<string, string | null>;
    addresses?: number | Record<string, string>[];
    /** Make GET /me/profile fail with a 500, to see the page's load-error state. */
    fail_profile?: boolean;
  },
) {
  const res = await fetch(`${MOCK}/__test/seed`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ email: who.email, ...data }),
  });
  if (!res.ok) throw new Error(`seed failed: ${res.status}`);
}

export interface SeedHousehold {
  name: string;
  /** The seeded user's own role in it (default owner). */
  role?: "owner" | "admin" | "member";
  members?: { email: string; display_name?: string; role?: "owner" | "admin" | "member" }[];
  /** Extra plain members ("Member 1", "Member 2", ...). */
  extra_members?: number;
}

async function post<T>(path: string, body: unknown): Promise<T> {
  const res = await fetch(`${MOCK}${path}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok && res.status !== 204) throw new Error(`${path} failed: ${res.status}`);
  return (res.status === 204 ? undefined : await res.json()) as T;
}

/** Creates households for a user in the mock API. Returns their ids (in order) and the personal space id. */
export function seedHouseholds(who: { email: string }, households: SeedHousehold[]) {
  return post<{ ids: string[]; personal_id: string }>("/__test/households", { email: who.email, households });
}

/** Makes the user's spaces and/or members list calls fail with a 500, to see the error states. */
export function failLists(who: { email: string }, flags: { spaces?: boolean; members?: boolean; delay_ms?: number }) {
  return post<void>("/__test/fail", { email: who.email, ...flags });
}

/** Removes a user from a household behind the app's back, as if another member had removed them. */
export function removeFromHousehold(who: { email: string }, spaceId: string) {
  return post<void>("/__test/leave", { email: who.email, space_id: spaceId });
}

export interface StoredSpace {
  id: string;
  name: string;
  members: { user_id: string; email: string; role: string }[];
}

/** A household as the mock API stores it, to check what the app really saved. */
export function storedSpace(spaceId: string) {
  return post<StoredSpace>("/__test/space", { space_id: spaceId });
}

/** The mock's user id for an email (the same id the token and the members list use). */
export async function userIdFor(who: { email: string }): Promise<string> {
  const res = await post<{ sub: string }>("/__test/token", { email: who.email });
  return res.sub;
}

/** How many times this user called each API path so far, for example {"GET /api/v1/me": 1}. */
export async function apiHits(who: { email: string }): Promise<Record<string, number>> {
  const res = await fetch(`${MOCK}/__test/hits`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ email: who.email }),
  });
  return (await res.json()) as Record<string, number>;
}

/** Signs in without the UI: mints a token from the mock and stores it in the session cookie. */
export async function signInAs(context: BrowserContext, who: { email: string } = USER) {
  const res = await fetch(`${MOCK}/__test/token`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ email: who.email }),
  });
  const { access_token, sub } = (await res.json()) as { access_token: string; sub: string };
  const now = Math.floor(Date.now() / 1000);
  const session = {
    access_token,
    refresh_token: "mock-refresh",
    token_type: "bearer",
    expires_in: 3600,
    expires_at: now + 3600,
    user: { id: sub, aud: "authenticated", role: "authenticated", email: who.email, app_metadata: {}, user_metadata: {} },
  };
  await context.addCookies([
    {
      name: COOKIE,
      value: `base64-${Buffer.from(JSON.stringify(session)).toString("base64url")}`,
      url: APP,
    },
  ]);
}
