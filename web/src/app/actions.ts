"use server";

import { cookies } from "next/headers";
import { resolveSpaceId, SPACE_COOKIE } from "@/lib/space";

/**
 * Stores the active space in the `hemfin-space` cookie. This is a stub: the id is
 * only validated against the placeholder spaces until real spaces exist (Phase 2).
 * The cookie holds a space id, not a secret.
 */
export async function setActiveSpace(spaceId: string): Promise<void> {
  const jar = await cookies();
  jar.set(SPACE_COOKIE, resolveSpaceId(spaceId), {
    path: "/",
    sameSite: "lax",
    maxAge: 60 * 60 * 24 * 365,
  });
}
