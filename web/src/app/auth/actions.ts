"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { SPACE_COOKIE } from "@/lib/space";
import { createClient } from "@/lib/supabase/server";

/** Ends the session and removes the saved space, which belongs to the account that is leaving. */
async function endSession(): Promise<void> {
  try {
    const supabase = await createClient();
    await supabase.auth.signOut();
  } catch {
    // Even if Supabase is unreachable, leave the app; the proxy treats a missing session as signed out.
  }
  (await cookies()).delete(SPACE_COOKIE);
}

/** Signs the user out (clears the session cookies) and returns to the sign-in page. */
export async function signOut(): Promise<void> {
  await endSession();
  redirect("/sign-in");
}

/**
 * Signs out without leaving the page. The invitation page uses it for "Sign out" so the invitee
 * stays on /invite and can sign in with the address the invitation was sent to.
 */
export async function signOutInPlace(): Promise<void> {
  await endSession();
}
