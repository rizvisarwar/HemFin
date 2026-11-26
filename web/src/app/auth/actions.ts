"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { SPACE_COOKIE } from "@/lib/space";
import { createClient } from "@/lib/supabase/server";

/** Signs the user out (clears the session cookies) and returns to the sign-in page. */
export async function signOut(): Promise<void> {
  try {
    const supabase = await createClient();
    await supabase.auth.signOut();
  } catch {
    // Even if Supabase is unreachable, leave the app; the proxy treats a missing session as signed out.
  }
  // The saved space belongs to the account that is leaving; the next account must not inherit it.
  (await cookies()).delete(SPACE_COOKIE);
  redirect("/sign-in");
}
