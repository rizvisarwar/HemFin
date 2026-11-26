import { NextResponse, type NextRequest } from "next/server";
import { sanitizeNext } from "@/lib/auth/next-path";
import { createClient } from "@/lib/supabase/server";

/**
 * Auth callback (PKCE): email confirmation, password recovery and Google sign-in all return
 * here with a one-time `code`, which is exchanged for a session cookie. `next` is sanitised, so
 * this cannot redirect off-site. Failures go back to sign-in with a generic flag (no detail).
 */
export async function GET(request: NextRequest) {
  const { searchParams, origin } = request.nextUrl;
  const code = searchParams.get("code");
  const next = sanitizeNext(searchParams.get("next"), "/dashboard");

  if (code) {
    try {
      const supabase = await createClient();
      const { error } = await supabase.auth.exchangeCodeForSession(code);
      if (!error) return NextResponse.redirect(new URL(next, origin));
    } catch {
      // fall through to the generic failure
    }
  }
  return NextResponse.redirect(new URL("/sign-in?error=link", origin));
}
