/**
 * A one-time message that survives one navigation inside the app ("You left The Lee family." on the
 * household list). It lives in sessionStorage for this tab only, is read once and removed, and never
 * goes in a URL. Everything is wrapped because storage can be blocked.
 */
const KEY = "hemfin-flash";

export function setFlash(message: string): void {
  try {
    window.sessionStorage.setItem(KEY, message);
  } catch {
    // storage blocked: the message is simply not shown
  }
}

export function takeFlash(): string | null {
  try {
    const value = window.sessionStorage.getItem(KEY);
    if (value !== null) window.sessionStorage.removeItem(KEY);
    return value;
  } catch {
    return null;
  }
}

/** Names of spaces this tab has seen, so "You no longer have access to X." can say which one. */
const NAMES_KEY = "hemfin-space-names";

export function rememberSpaceNames(spaces: { id: string; name: string }[]): void {
  try {
    // Merged with what is already stored, so a household that has just been lost is still remembered.
    const known = JSON.parse(window.sessionStorage.getItem(NAMES_KEY) ?? "{}") as Record<string, string>;
    for (const s of spaces) known[s.id] = s.name;
    window.sessionStorage.setItem(NAMES_KEY, JSON.stringify(known));
  } catch {
    // ignore
  }
}

export function recallSpaceName(id: string): string | null {
  try {
    const map = JSON.parse(window.sessionStorage.getItem(NAMES_KEY) ?? "{}") as Record<string, unknown>;
    const name = map[id];
    return typeof name === "string" ? name : null;
  } catch {
    return null;
  }
}
