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
  data: { display_name?: string | null; profile?: Record<string, string | null>; addresses?: number | Record<string, string>[] },
) {
  const res = await fetch(`${MOCK}/__test/seed`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ email: who.email, ...data }),
  });
  if (!res.ok) throw new Error(`seed failed: ${res.status}`);
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
