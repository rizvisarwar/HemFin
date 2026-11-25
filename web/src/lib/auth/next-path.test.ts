import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { DEFAULT_NEXT, sanitizeNext } from "./next-path.ts";

describe("sanitizeNext", () => {
  it("keeps same-origin relative paths, with query and hash", () => {
    assert.equal(sanitizeNext("/contracts"), "/contracts");
    assert.equal(sanitizeNext("/reports?range=30d#top"), "/reports?range=30d#top");
    assert.equal(sanitizeNext("/profile/addresses"), "/profile/addresses");
  });

  it("falls back for missing or non-string values", () => {
    for (const v of [undefined, null, "", 42, ["/a"], {}]) assert.equal(sanitizeNext(v), DEFAULT_NEXT);
  });

  it("rejects absolute and protocol-relative URLs", () => {
    for (const v of [
      "https://evil.example",
      "http://evil.example/x",
      "//evil.example",
      "///evil.example",
      "/\\evil.example",
      "\\\\evil.example",
      "javascript:alert(1)",
      "data:text/html,x",
      "evil.example",
      "contracts",
    ]) {
      assert.equal(sanitizeNext(v), DEFAULT_NEXT, v);
    }
  });

  it("rejects tricks that normalise into another origin", () => {
    for (const v of ["/\t/evil.example", "/\n/evil.example", "/\r//evil.example", "/.//evil.example", "/a/..//evil.example"]) {
      assert.equal(sanitizeNext(v), DEFAULT_NEXT, JSON.stringify(v));
    }
  });

  it("rejects control characters and very long values", () => {
    assert.equal(sanitizeNext("/a\u0000b"), DEFAULT_NEXT);
    assert.equal(sanitizeNext(`/${"a".repeat(3000)}`), DEFAULT_NEXT);
  });

  it("does not bounce back to auth pages or the callback", () => {
    for (const v of ["/sign-in", "/sign-in?next=/x", "/sign-up", "/forgot-password", "/auth/callback?code=1", "/check-email"]) {
      assert.equal(sanitizeNext(v), DEFAULT_NEXT, v);
    }
  });

  it("uses the given fallback", () => {
    assert.equal(sanitizeNext("//x", "/profile"), "/profile");
  });
});
