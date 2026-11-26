/**
 * The tab-only "joined" marker (docs/design/households.md 6.8 K): the household's id and name, never
 * a token. It lets a reload of /invite after a successful accept show "You joined ..." instead of the
 * generic message (the API answers 404 for a used token). It is keyed by the signed-in user's id,
 * lives in sessionStorage only, and `clearHemfinSession` removes it on sign-out.
 */
import { SESSION_PREFIX } from "../households/flash.ts"; // relative, so the unit test can load this file

const joinedKey = (userId: string) => `${SESSION_PREFIX}joined:${userId}`;

export interface JoinedMarker {
  spaceId: string;
  name: string;
}

export function setJoined(userId: string, marker: JoinedMarker): void {
  try {
    window.sessionStorage.setItem(joinedKey(userId), JSON.stringify(marker));
  } catch {
    // storage blocked: a reload then shows the generic state, which is the safe fallback
  }
}

export function getJoined(userId: string): JoinedMarker | null {
  try {
    const raw = window.sessionStorage.getItem(joinedKey(userId));
    if (!raw) return null;
    const value = JSON.parse(raw) as Partial<JoinedMarker>;
    return typeof value.spaceId === "string" && typeof value.name === "string"
      ? { spaceId: value.spaceId, name: value.name }
      : null;
  } catch {
    return null;
  }
}

export function clearJoined(userId: string): void {
  try {
    window.sessionStorage.removeItem(joinedKey(userId));
  } catch {
    // ignore
  }
}
