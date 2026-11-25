/** Route groups used by the proxy. Keep in sync with the (app) route group. */
export const APP_PATH_PREFIXES = [
  "/dashboard",
  "/notifications",
  "/contracts",
  "/expenses",
  "/income",
  "/reports",
  "/documents",
  "/suggestions",
  "/assistant",
  "/household",
  "/profile",
] as const;

/** Pages for signed-out users only: a signed-in visitor is sent to the dashboard. */
export const AUTH_PAGES = ["/sign-in", "/sign-up", "/forgot-password", "/check-email"] as const;

function matches(pathname: string, base: string): boolean {
  return pathname === base || pathname.startsWith(`${base}/`);
}

export function isAppPath(pathname: string): boolean {
  return APP_PATH_PREFIXES.some((p) => matches(pathname, p));
}

export function isAuthPage(pathname: string): boolean {
  return AUTH_PAGES.some((p) => matches(pathname, p));
}
