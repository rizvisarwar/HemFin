import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { formatMoney, makeFormatter } from "./format.ts";

describe("formatMoney", () => {
  it("formats a decimal string without float loss", () => {
    assert.equal(formatMoney("9007199254740993.01", "EUR", "en"), "€9,007,199,254,740,993.01");
  });
});

describe("makeFormatter uses the profile's currency and locale", () => {
  it("follows the locale's number conventions", () => {
    assert.equal(makeFormatter({ currency: "EUR", locale: "en" }).money("1240.5"), "€1,240.50");
    assert.match(makeFormatter({ currency: "EUR", locale: "nl-NL" }).money("1240.5"), /€\s?1\.240,50/);
    assert.match(makeFormatter({ currency: "USD", locale: "en-US" }).money("-3"), /-\$3\.00/);
  });
  it("lets a record keep its own currency", () => {
    assert.equal(makeFormatter({ currency: "EUR", locale: "en" }).money("5", { currency: "USD" }), "$5.00");
  });
  it("never throws for a bad saved locale or currency", () => {
    assert.equal(makeFormatter({ currency: "EUR", locale: "not a locale" }).money("2"), "€2.00");
    assert.equal(makeFormatter({ currency: "??", locale: "en" }).money("2"), "€2.00");
  });
  it("formats dates in the locale", () => {
    assert.match(makeFormatter({ currency: "EUR", locale: "en" }).date("2026-11-26T10:00:00Z"), /Nov.*2026/);
  });
});
