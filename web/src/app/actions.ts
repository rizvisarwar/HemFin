"use server";

import { cookies, headers } from "next/headers";
import { resolveSpaceId, SPACE_COOKIE } from "@/lib/space";

/**
 * Stores the active space in the `hemfin-space` cookie. This is a stub: the id is
 * only validated against the placeholder spaces until real spaces exist (Phase 2).
 * The cookie holds a space id, not a secret.
 */
export async function setActiveSpace(spaceId: string): Promise<void> {
  const jar = await cookies();
  // Secure in production over https (Vercel sets x-forwarded-proto). A plain-http local
  // `next start` would otherwise lose the cookie in browsers that do not treat localhost as secure.
  const https = (await headers()).get("x-forwarded-proto") === "https";
  jar.set(SPACE_COOKIE, resolveSpaceId(spaceId), {
    path: "/",
    sameSite: "lax",
    httpOnly: true, // only the server reads it (the layout), never client JS
    secure: process.env.NODE_ENV === "production" && https,
    maxAge: 60 * 60 * 24 * 365,
  });
}
