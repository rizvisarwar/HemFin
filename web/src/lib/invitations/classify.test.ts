import assert from "node:assert/strict";
import { test } from "node:test";
import { classify } from "./classify.ts";

test("2xx is ok", () => {
  for (const s of [200, 201, 204]) assert.equal(classify(s), "ok");
});

test("401 is the ended session", () => {
  assert.equal(classify(401), "auth");
});

test("429 and every 5xx are the transient try-again state", () => {
  for (const s of [429, 500, 502, 503, 504]) assert.equal(classify(s), "server");
});

test("every other 4xx is the one generic state, whatever the reason", () => {
  for (const s of [400, 403, 404, 409, 410, 422, 451]) assert.equal(classify(s), "generic");
});
