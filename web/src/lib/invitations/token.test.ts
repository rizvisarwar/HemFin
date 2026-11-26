import assert from "node:assert/strict";
import { beforeEach, test } from "node:test";
import { clearHemfinSession } from "../households/flash.ts";
import { clearJoined, getJoined, setJoined } from "./joined.ts";
import {
  captureTokenFromLocation,
  clearStoredToken,
  getStoredToken,
  INVITE_TOKEN_KEY,
  parseTokenFromHash,
} from "./token.ts";

// A made-up, token-shaped value (43 URL-safe characters), built rather than written out.
const TOKEN = "t".repeat(20) + "_-" + "9".repeat(21);

/** A minimal window with sessionStorage and a location/history the code can rewrite. */
function fakeWindow(url: string, opts: { blockedStorage?: boolean } = {}) {
  const data = new Map<string, string>();
  const loc = new URL(url);
  const replaced: string[] = [];
  const storage = {
    get length() {
      return data.size;
    },
    key: (i: number) => [...data.keys()][i] ?? null,
    getItem: (k: string) => {
      if (opts.blockedStorage) throw new Error("blocked");
      return data.get(k) ?? null;
    },
    setItem: (k: string, v: string) => {
      if (opts.blockedStorage) throw new Error("blocked");
      data.set(k, v);
    },
    removeItem: (k: string) => void data.delete(k),
  };
  const win = {
    sessionStorage: storage,
    location: {
      get hash() {
        return loc.hash;
      },
      get search() {
        return loc.search;
      },
      get pathname() {
        return loc.pathname;
      },
    },
    history: {
      state: null,
      replaceState: (_s: unknown, _t: string, next: string) => {
        replaced.push(next);
        const u = new URL(next, loc);
        loc.hash = "";
        loc.search = u.search;
      },
    },
  };
  (globalThis as unknown as { window: unknown }).window = win;
  return { data, replaced, loc };
}

beforeEach(() => clearStoredToken());

test("parseTokenFromHash accepts a well-formed token and nothing else", () => {
  assert.equal(parseTokenFromHash(`#token=${TOKEN}`), TOKEN);
  assert.equal(parseTokenFromHash(`token=${TOKEN}`), TOKEN);
  assert.equal(parseTokenFromHash(""), null);
  assert.equal(parseTokenFromHash("#token="), null);
  assert.equal(parseTokenFromHash("#token=short"), null);
  assert.equal(parseTokenFromHash("#token=has spaces and <tags> in it, so not a token"), null);
  assert.equal(parseTokenFromHash(`#other=${TOKEN}`), null);
});

test("capture stores the token and strips the fragment from the address bar", () => {
  const w = fakeWindow(`https://app.example/invite#token=${TOKEN}`);
  assert.equal(captureTokenFromLocation(), TOKEN);
  assert.equal(w.data.get(INVITE_TOKEN_KEY), TOKEN);
  assert.deepEqual(w.replaced, ["/invite"]);
  assert.equal(w.loc.hash, "");
  // A second call (React Strict Mode) still returns the token, from storage.
  assert.equal(captureTokenFromLocation(), TOKEN);
});

test("a token in the query string is never used, and the query string is removed too", () => {
  const w = fakeWindow(`https://app.example/invite?token=${TOKEN}`);
  assert.equal(captureTokenFromLocation(), null);
  assert.equal(w.data.size, 0);
  assert.deepEqual(w.replaced, ["/invite"]);
});

test("with storage blocked the token is carried in memory", () => {
  fakeWindow(`https://app.example/invite#token=${TOKEN}`, { blockedStorage: true });
  assert.equal(captureTokenFromLocation(), TOKEN);
  assert.equal(getStoredToken(), TOKEN);
  clearStoredToken();
  assert.equal(getStoredToken(), null);
});

test("sign-out clears the token and the joined marker, except a kept key", () => {
  const w = fakeWindow(`https://app.example/invite#token=${TOKEN}`);
  captureTokenFromLocation();
  setJoined("user-1", { spaceId: "s1", name: "The Lee family" });
  w.data.set("unrelated", "keep me");
  assert.deepEqual(getJoined("user-1"), { spaceId: "s1", name: "The Lee family" });
  assert.equal(getJoined("user-2"), null, "another user never reads this marker");

  clearHemfinSession([INVITE_TOKEN_KEY]);
  assert.equal(getJoined("user-1"), null);
  assert.equal(w.data.get(INVITE_TOKEN_KEY), TOKEN);
  assert.equal(w.data.get("unrelated"), "keep me");

  clearHemfinSession();
  assert.equal(w.data.has(INVITE_TOKEN_KEY), false);
  assert.deepEqual([...w.data.keys()], ["unrelated"]);
});

test("the joined marker holds the household and no token", () => {
  const w = fakeWindow("https://app.example/invite");
  setJoined("user-1", { spaceId: "s1", name: "The Lee family" });
  const [raw] = [...w.data.values()];
  assert.equal(raw, JSON.stringify({ spaceId: "s1", name: "The Lee family" }));
  clearJoined("user-1");
  assert.equal(w.data.size, 0);
});
