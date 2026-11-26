"use server";

import { cookies, headers } from "next/headers";
import { fetchMe } from "@/lib/api-server";
import { SPACE_COOKIE } from "@/lib/space";

/**
 * Stores the active space in the `hemfin-space` cookie. The id is checked against the user's own
 * spaces (from the API), so a forged id is ignored. The cookie holds a space id, not a secret;
 * the API still gates every space request by membership.
 */
export async function setActiveSpace(spaceId: string): Promise<boolean> {
  const me = await fetchMe();
  if (!me || !me.spaces.some((s) => s.id === spaceId)) return false;
  const jar = await cookies();
  // Secure in production over https (Vercel sets x-forwarded-proto). A plain-http local
  // `next start` would otherwise lose the cookie in browsers that do not treat localhost as secure.
  const https = (await headers()).get("x-forwarded-proto") === "https";
  jar.set(SPACE_COOKIE, spaceId, {
    path: "/",
    sameSite: "lax",
    httpOnly: true, // only the server reads it (the layout), never client JS
    secure: process.env.NODE_ENV === "production" && https,
    maxAge: 60 * 60 * 24 * 365,
  });
  return true;
}
