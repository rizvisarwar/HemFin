/**
 * Per-tab, per-user browser state for the household screens. It lives in sessionStorage only, is
 * keyed by the signed-in user's id (so a store left behind by an abandoned session is never read by
 * another user), and is wiped on sign-out by `clearHemfinSession`. Everything is wrapped because
 * storage can be blocked. Nothing here is ever put in a URL or a cookie.
 */
const PREFIX = "hemfin-";
const flashKey = (userId: string) => `${PREFIX}flash:${userId}`;
const namesKey = (userId: string) => `${PREFIX}space-names:${userId}`;

/** A one-time message that survives one navigation ("You left The Lee family."). */
export function setFlash(userId: string, message: string): void {
  try {
    window.sessionStorage.setItem(flashKey(userId), message);
  } catch {
    // storage blocked: the message is simply not shown
  }
}

export function takeFlash(userId: string): string | null {
  try {
    const value = window.sessionStorage.getItem(flashKey(userId));
    if (value !== null) window.sessionStorage.removeItem(flashKey(userId));
    return value;
  } catch {
    return null;
  }
}

/** Names of spaces this tab has seen, so "You no longer have access to X." can say which one. */
export function rememberSpaceNames(userId: string, spaces: { id: string; name: string }[]): void {
  try {
    // Merged with what is already stored, so a household that has just been lost is still remembered.
    const known = JSON.parse(window.sessionStorage.getItem(namesKey(userId)) ?? "{}") as Record<string, string>;
    for (const s of spaces) known[s.id] = s.name;
    window.sessionStorage.setItem(namesKey(userId), JSON.stringify(known));
  } catch {
    // ignore
  }
}

export function recallSpaceName(userId: string, id: string): string | null {
  try {
    const map = JSON.parse(window.sessionStorage.getItem(namesKey(userId)) ?? "{}") as Record<string, unknown>;
    const name = map[id];
    return typeof name === "string" ? name : null;
  } catch {
    return null;
  }
}

/** Removes every HemFin key from this tab's sessionStorage (household names, flash, joined marker). Call on sign-out. */
export function clearHemfinSession(): void {
  try {
    const keys: string[] = [];
    for (let i = 0; i < window.sessionStorage.length; i++) {
      const key = window.sessionStorage.key(i);
      if (key?.startsWith(PREFIX)) keys.push(key);
    }
    for (const key of keys) window.sessionStorage.removeItem(key);
  } catch {
    // ignore
  }
}
