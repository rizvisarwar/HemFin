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

export interface SeedDashboard {
  month: string;
  base_currency: string;
  spent_this_month: { amount: string; currency: string };
  recurring_monthly: { amount: string; currency: string };
  income_this_month: { amount: string; currency: string };
  upcoming: {
    type: "payment" | "renewal" | "notice_deadline";
    date: string;
    contract_id: string;
    contract_name: string;
    amount: { amount: string; currency: string } | null;
  }[];
  has_records: boolean;
  unconverted_count: number;
}

/** Seeds the dashboard summary the mock API returns for a user, or makes it fail with a 500. */
export function seedDashboard(who: { email: string }, opts: { dashboard?: SeedDashboard; fail?: boolean }) {
  return post<void>("/__test/dashboard", { email: who.email, ...opts });
}

/** Makes the user's spaces and/or members list calls fail with a 500, to see the error states. */
export function failLists(who: { email: string }, flags: { spaces?: boolean; members?: boolean; me?: boolean; delay_ms?: number }) {
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

/** The `code` of a confirmation link for this email, as the mock's PKCE exchange understands it. */
export function mockAuthCode(who: { email: string }): string {
  return `mock-code-${Buffer.from(who.email).toString("base64url")}`;
}

export interface SeedInvitation {
  space_id: string;
  email: string;
  role?: "admin" | "member";
  status?: "pending" | "expired" | "accepted" | "declined" | "revoked";
  /** The household member who sent it (default: the owner). */
  inviter_email?: string;
  /** Resends already used in the last 24 hours (3 means the daily cap is reached). */
  resend_count?: number;
  /** How long ago the last email went out (default an hour, so Resend works at once). */
  last_sent_seconds_ago?: number;
}

/** Creates an invitation in the mock API. Returns its id and the raw token the email link carries. */
export function seedInvitation(data: SeedInvitation) {
  return post<{ id: string; token: string }>("/__test/invitation", data);
}

export interface StoredInvitation {
  id: string;
  email: string;
  role: string;
  status: string;
}

/** A household's invitations as the mock API stores them (no tokens), newest first. */
export function storedInvitations(spaceId: string) {
  return post<StoredInvitation[]>("/__test/invitations", { space_id: spaceId });
}

/** How the next invitation calls behave for a user (see the mock's /__test/invitation-mode). */
export function invitationMode(
  who: { email: string },
  mode: { email_mode?: "ok" | "not_sent" | "unconfigured"; fail_invitee?: 401 | 500 | null; fail_invitations_list?: boolean },
) {
  return post<void>("/__test/invitation-mode", { email: who.email, ...mode });
}

/** Requests the mock saw with this token in the URL or a header (it must be none: the body only). */
export function tokenLeaks(token: string) {
  return post<{ method: string; path: string }[]>("/__test/leaks", { token });
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

export interface SeedContract {
  name: string;
  /** Category key, for example "insurance.car". */
  category?: string;
  provider?: string | null;
  amount?: string;
  currency?: string;
  frequency?: "weekly" | "monthly" | "quarterly" | "semiannual" | "annual";
  start_date?: string;
  end_date?: string | null;
  auto_renew?: boolean;
  renewal_term_months?: number | null;
  notice_period_days?: number | null;
  /** A member's user id, or null for the whole household. */
  member_user_id?: string | null;
  status?: "active" | "cancelled";
  notes?: string | null;
  /** The schedule the real API would compute, set by the test (the mock does not compute it). */
  schedule?: { next_payment_date: string | null; renewal_date: string | null; notice_deadline: string | null };
}

/** Creates contracts in a space of the mock API. Returns their ids, in order. */
export function seedContracts(spaceId: string, contracts: SeedContract[]) {
  return post<{ ids: string[] }>("/__test/contracts", { space_id: spaceId, contracts });
}

export interface StoredContract {
  id: string;
  name: string;
  category: string;
  provider: string | null;
  amount: string;
  currency: string;
  frequency: string;
  start_date: string;
  end_date: string | null;
  auto_renew: boolean;
  renewal_term_months: number | null;
  notice_period_days: number | null;
  member_user_id: string | null;
  status: string;
  notes: string | null;
}

/** A space's contracts as the mock API stores them, to check what the app really saved. */
export function storedContracts(spaceId: string) {
  return post<StoredContract[]>("/__test/stored-contracts", { space_id: spaceId });
}

/** Makes the contract list and get calls (`list`) and/or the create, update and delete calls (`save`) fail with a 500. */
export function failContracts(who: { email: string }, flags: { list?: boolean; save?: boolean }) {
  return post<void>("/__test/contracts-fail", { email: who.email, ...flags });
}

/** Selects a space the way the switcher does: by writing the cookie the server reads. */
export async function selectSpace(context: BrowserContext, spaceId: string) {
  await context.addCookies([{ name: "hemfin-space", value: spaceId, url: APP, httpOnly: true, sameSite: "Lax" }]);
}

/** A calendar date `days` from today in the test runner's time zone, "YYYY-MM-DD". */
export function isoIn(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() + days);
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}
