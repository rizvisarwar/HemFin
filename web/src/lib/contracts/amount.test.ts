import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { amountToInput, decimalMark, fractionDigits, parseAmount } from "./amount.ts";

const en = { mark: "." as const, digits: 2, currency: "EUR" };
const de = { mark: "," as const, digits: 2, currency: "EUR" };

describe("parseAmount", () => {
  it("accepts the locale's own decimal mark and sends a dot", () => {
    assert.deepEqual(parseAmount("12.50", en), { ok: true, value: "12.50" });
    assert.deepEqual(parseAmount("1250", en), { ok: true, value: "1250" });
    assert.deepEqual(parseAmount(" 12,50 ", de), { ok: true, value: "12.50" });
  });
  it("keeps long digit strings exactly", () => {
    assert.deepEqual(parseAmount("9007199254740993.01", en), { ok: true, value: "9007199254740993.01" });
  });
  it("drops leading zeros but keeps a zero before the mark", () => {
    assert.deepEqual(parseAmount("007.5", en), { ok: true, value: "7.5" });
    assert.deepEqual(parseAmount("0.50", en), { ok: true, value: "0.50" });
  });
  it("rejects the other mark, thousands separators, spaces, letters and signs", () => {
    for (const bad of ["12,50", "1,250", "1 250", "12.5.0", "-5", "+5", "abc", "1e3", ".5", "5."]) {
      assert.deepEqual(parseAmount(bad, en), { ok: false, message: "Enter an amount like 12.50." }, bad);
    }
    assert.deepEqual(parseAmount("12.50", de), { ok: false, message: "Enter an amount like 12,50." });
    assert.deepEqual(parseAmount("1.250", de), { ok: false, message: "Enter an amount like 12,50." });
  });
  it("says what is wrong when empty, zero or too precise", () => {
    assert.deepEqual(parseAmount("  ", en), { ok: false, message: "Enter the amount." });
    assert.deepEqual(parseAmount("0", en), { ok: false, message: "Enter an amount greater than 0." });
    assert.deepEqual(parseAmount("0.00", en), { ok: false, message: "Enter an amount greater than 0." });
    assert.deepEqual(parseAmount("1.234", en), { ok: false, message: "EUR amounts can have up to 2 decimal places." });
    assert.deepEqual(parseAmount("5.5", { mark: ".", digits: 0, currency: "JPY" }), {
      ok: false,
      message: "JPY amounts are whole numbers.",
    });
  });
});

describe("currency helpers", () => {
  it("knows decimal marks and minor units", () => {
    assert.equal(decimalMark("en"), ".");
    assert.equal(decimalMark("de"), ",");
    assert.equal(decimalMark("not a locale"), ".");
    assert.equal(fractionDigits("EUR"), 2);
    assert.equal(fractionDigits("JPY"), 0);
  });
  it("shows an API amount as editable text", () => {
    assert.equal(amountToInput("4350.00", { mark: ".", digits: 2 }), "4350.00");
    assert.equal(amountToInput("4350.0000", { mark: ",", digits: 2 }), "4350,00");
    assert.equal(amountToInput("12", { mark: ".", digits: 2 }), "12");
  });
});
