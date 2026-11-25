/**
 * Post-sign-in redirect target (`?next=`). Only a same-origin relative path is ever accepted, so
 * the sign-in flow cannot be used as an open redirect. Anything else falls back to the dashboard.
 */
export const DEFAULT_NEXT = "/dashboard";

const BASE = "http://hemfin.invalid";
// Control characters (URL parsing strips tabs and newlines, which could turn "/\t/x" into "//x").
// eslint-disable-next-line no-control-regex
const CONTROL = /[\u0000-\u001f\u007f]/;
// Paths that must never be a redirect target (loops, or flows that need their own entry).
const BLOCKED_PREFIXES = ["/sign-in", "/sign-up", "/forgot-password", "/check-email", "/auth/"];

export function sanitizeNext(raw: unknown, fallback: string = DEFAULT_NEXT): string {
  if (typeof raw !== "string" || raw.length === 0 || raw.length > 2048) return fallback;
  if (CONTROL.test(raw) || raw.includes("\\")) return fallback;
  if (!raw.startsWith("/") || raw.startsWith("//")) return fallback;
  let url: URL;
  try {
    url = new URL(raw, BASE);
  } catch {
    return fallback;
  }
  if (url.origin !== BASE) return fallback;
  const path = url.pathname + url.search + url.hash;
  // Normalisation can create a protocol-relative path (for example "/.//evil.example").
  if (!path.startsWith("/") || path.startsWith("//")) return fallback;
  if (BLOCKED_PREFIXES.some((p) => url.pathname === p || url.pathname.startsWith(p.endsWith("/") ? p : `${p}/`))) {
    return fallback;
  }
  return path;
}
