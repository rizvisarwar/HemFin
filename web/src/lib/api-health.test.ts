import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { fetchApiStatus, HEALTH_TIMEOUT_MS } from "./api-health.ts";

type Client = Parameters<typeof fetchApiStatus>[0];
// Minimal fake of the client's GET: we only care about the response and the signal.
const fake = (impl: (opts: { signal: AbortSignal; cache?: string }) => Promise<unknown>) =>
  ({ GET: (_path: string, opts: { signal: AbortSignal; cache?: string }) => impl(opts) }) as unknown as Client;

describe("fetchApiStatus", () => {
  it("is online on a 2xx response and asks for /health uncached with a timeout signal", async () => {
    let seen: { signal: AbortSignal; cache?: string } | undefined;
    const status = await fetchApiStatus(
      fake(async (opts) => {
        seen = opts;
        return { response: new Response("{}", { status: 200 }) };
      }),
    );
    assert.equal(status, "online");
    assert.equal(seen?.cache, "no-store");
    assert.ok(seen?.signal instanceof AbortSignal);
  });

  it("is offline on a non-2xx response", async () => {
    const status = await fetchApiStatus(fake(async () => ({ response: new Response("", { status: 503 }) })));
    assert.equal(status, "offline");
  });

  it("is offline when the request throws", async () => {
    const status = await fetchApiStatus(
      fake(async () => {
        throw new TypeError("fetch failed");
      }),
    );
    assert.equal(status, "offline");
  });

  it("is offline when the API is slower than the timeout", async () => {
    const started = Date.now();
    const status = await fetchApiStatus(
      fake(
        (opts) =>
          new Promise((_, reject) => {
            opts.signal.addEventListener("abort", () => reject(opts.signal.reason));
          }),
      ),
      50,
    );
    assert.equal(status, "offline");
    assert.ok(Date.now() - started < 1500);
  });

  it("keeps the 2 s default timeout", () => {
    assert.equal(HEALTH_TIMEOUT_MS, 2000);
  });
});
