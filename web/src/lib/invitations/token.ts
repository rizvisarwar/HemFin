/**
 * The invitation token (HEM-016). It arrives in the URL fragment (`/invite#token=...`), which
 * browsers never send to a server, in a `Referer` or to analytics. The page moves it into this
 * tab's sessionStorage (memory when storage is blocked) and strips the fragment from the address
 * bar straight away. It is never put in a query string, a cookie, a log or server-rendered HTML,
 * and it only leaves the browser in the JSON body of the preview, accept and decline calls.
 *
 * The key starts with `hemfin-`, so `clearHemfinSession` removes it on sign-out. The one
 * exception is the "Sign out" button on /invite itself, which keeps it so the invitee can sign
 * in with the address the invitation was sent to.
 */
import { SESSION_PREFIX } from "../households/flash.ts"; // relative, so the unit test can load this file

export const INVITE_TOKEN_KEY = `${SESSION_PREFIX}invite-token`;
/** Server tokens are URL-safe base64; anything else is not one of ours and is treated as missing. */
const TOKEN_SHAPE = /^[A-Za-z0-9_-]{16,512}$/;

let memoryToken: string | null = null;

/** The token in a location hash such as "#token=abc", or null when there is none or it is malformed. Pure. */
export function parseTokenFromHash(hash: string): string | null {
  const raw = hash.startsWith("#") ? hash.slice(1) : hash;
  const value = new URLSearchParams(raw).get("token");
  return value !== null && TOKEN_SHAPE.test(value) ? value : null;
}

function store(token: string): void {
  memoryToken = token;
  try {
    window.sessionStorage.setItem(INVITE_TOKEN_KEY, token);
  } catch {
    // storage blocked: the in-memory copy still carries the token through this page load
  }
}

/** The stored token (sessionStorage first, then memory), or null. */
export function getStoredToken(): string | null {
  try {
    const value = window.sessionStorage.getItem(INVITE_TOKEN_KEY);
    if (value && TOKEN_SHAPE.test(value)) return value;
  } catch {
    // fall through to memory
  }
  return memoryToken;
}

export function clearStoredToken(): void {
  memoryToken = null;
  try {
    window.sessionStorage.removeItem(INVITE_TOKEN_KEY);
  } catch {
    // ignore
  }
}

/**
 * Takes the token out of the address bar: stores it, then rewrites the URL to the bare path with
 * `history.replaceState` (no fragment, no query), so it is gone from the address bar and the history
 * entry before anything else runs. Safe to call twice (React Strict Mode). Returns the token to use.
 */
export function captureTokenFromLocation(): string | null {
  const fromHash = parseTokenFromHash(window.location.hash);
  if (fromHash) store(fromHash);
  if (window.location.hash || window.location.search) {
    window.history.replaceState(window.history.state, "", window.location.pathname);
  }
  return fromHash ?? getStoredToken();
}
