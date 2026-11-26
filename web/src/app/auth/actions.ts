"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

/** Signs the user out (clears the session cookies) and returns to the sign-in page. */
export async function signOut(): Promise<void> {
  try {
    const supabase = await createClient();
    await supabase.auth.signOut();
  } catch {
    // Even if Supabase is unreachable, leave the app; the proxy treats a missing session as signed out.
  }
  redirect("/sign-in");
}
