import assert from "node:assert/strict";
import { afterEach, beforeEach, describe, it } from "node:test";
import { createApiClient } from "./index.ts";

const realFetch = globalThis.fetch;
let requests: Request[] = [];

beforeEach(() => {
  requests = [];
  globalThis.fetch = (async (input: Request) => {
    requests.push(input);
    return new Response(JSON.stringify({ status: "ok" }), {
      status: 200,
      headers: { "content-type": "application/json" },
    });
  }) as typeof fetch;
});

afterEach(() => {
  globalThis.fetch = realFetch;
});

describe("createApiClient", () => {
  it("sets Authorization: Bearer <token> when getToken returns a token", async () => {
    await createApiClient("http://api.test", () => "abc123").GET("/health");
    assert.equal(requests.length, 1);
    assert.equal(requests[0].headers.get("Authorization"), "Bearer abc123");
  });

  it("supports an async getToken", async () => {
    await createApiClient("http://api.test", async () => "async-token").GET("/health");
    assert.equal(requests[0].headers.get("Authorization"), "Bearer async-token");
  });

  it("omits the header when getToken returns null or undefined", async () => {
    await createApiClient("http://api.test", () => null).GET("/health");
    await createApiClient("http://api.test", async () => undefined).GET("/health");
    assert.equal(requests.length, 2);
    for (const req of requests) assert.equal(req.headers.has("Authorization"), false);
  });

  it("omits the header when no getToken is given", async () => {
    await createApiClient("http://api.test").GET("/health");
    assert.equal(requests[0].headers.has("Authorization"), false);
  });

  it("never puts the token in the URL and trims trailing slashes from the base URL", async () => {
    await createApiClient("http://api.test///", () => "secret-token").GET("/health");
    assert.equal(requests[0].url, "http://api.test/health");
    assert.ok(!requests[0].url.includes("secret-token"));
  });
});
