import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { sanitizeNext } from "@/lib/auth/next-path";
import { isAppPath, isAuthPage } from "@/lib/routes";
import { getSupabaseEnv } from "@/lib/supabase/env";

/**
 * Runs before every matched request (Next.js 16 "proxy", formerly middleware):
 *  1. refreshes the Supabase session cookies,
 *  2. sends signed-out users away from (app) routes to /sign-in?next=...,
 *  3. sends signed-in users away from the auth pages to /dashboard.
 *
 * This is an optimistic check only. Authorization is enforced by the API, which verifies the
 * access token on every call. Without Supabase env vars everyone counts as signed out.
 */
export async function proxy(request: NextRequest) {
  const { pathname, search } = request.nextUrl;
  const guarded = isAppPath(pathname);
  const authPage = isAuthPage(pathname);
  if (!guarded && !authPage) return NextResponse.next();

  let response = NextResponse.next({ request });
  let signedIn = false;

  const env = getSupabaseEnv();
  if (env) {
    const supabase = createServerClient(env.url, env.anonKey, {
      cookies: {
        getAll: () => request.cookies.getAll(),
        setAll(list) {
          for (const { name, value } of list) request.cookies.set(name, value);
          response = NextResponse.next({ request });
          for (const { name, value, options } of list) response.cookies.set(name, value, options);
        },
      },
    });
    // getClaims verifies the JWT signature against the project's JWKS (cached), so a forged
    // cookie does not count as signed in, and an expired token is refreshed first.
    const { data } = await supabase.auth.getClaims();
    signedIn = Boolean(data?.claims?.sub);
  }

  const redirectTo = (url: URL) => {
    const redirect = NextResponse.redirect(url);
    // Keep any refreshed session cookies on the redirect.
    for (const cookie of response.cookies.getAll()) redirect.cookies.set(cookie);
    return redirect;
  };

  if (guarded && !signedIn) {
    const url = request.nextUrl.clone();
    url.pathname = "/sign-in";
    url.search = "";
    url.searchParams.set("next", sanitizeNext(pathname + search));
    return redirectTo(url);
  }
  if (authPage && signedIn) {
    const url = request.nextUrl.clone();
    url.pathname = "/dashboard";
    url.search = "";
    return redirectTo(url);
  }
  return response;
}

export const config = {
  matcher: [
    // Everything except static assets and Next internals.
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)",
  ],
};
