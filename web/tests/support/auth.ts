import type { BrowserContext } from "@playwright/test";

export const MOCK = `http://127.0.0.1:${process.env.MOCK_PORT ?? 3199}`;
export const APP = "http://127.0.0.1:3100";
/** Supabase JS names the cookie after the first label of the project host: 127.0.0.1 gives "127". */
const COOKIE = "sb-127-auth-token";

export const USER = { email: "user@example.test" };
export const HOUSEHOLD_USER = { email: "household@example.test" };

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
