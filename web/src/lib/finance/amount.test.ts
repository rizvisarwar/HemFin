import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { AMOUNT_HINT, amountToInput, parseAmount } from "./amount.ts";

const ok = (value: string) => ({ ok: true, value });
const hint = { ok: false, message: AMOUNT_HINT };

describe("parseAmount", () => {
  it("accepts a decimal comma, a decimal dot and a whole number, and sends a dot", () => {
    assert.deepEqual(parseAmount("12,50"), ok("12.50"));
    assert.deepEqual(parseAmount("12.50"), ok("12.50"));
    assert.deepEqual(parseAmount("12"), ok("12"));
    assert.deepEqual(parseAmount(" 12,5 "), ok("12.5"));
    assert.deepEqual(parseAmount("1250"), ok("1250"));
  });
  it("accepts spaces between digit groups (regular, no-break, narrow no-break)", () => {
    assert.deepEqual(parseAmount("1 234,50"), ok("1234.50"));
    assert.deepEqual(parseAmount("1 234,50"), ok("1234.50"));
    assert.deepEqual(parseAmount("1 234 567"), ok("1234567"));
    assert.deepEqual(parseAmount("12 345.5"), ok("12345.5"));
  });
  it("keeps long digit strings exactly (no float parsing)", () => {
    assert.deepEqual(parseAmount("9007199254740993,01"), ok("9007199254740993.01"));
  });
  it("drops leading zeros but keeps a zero before the mark", () => {
    assert.deepEqual(parseAmount("007,5"), ok("7.5"));
    assert.deepEqual(parseAmount("0,50"), ok("0.50"));
  });
  it("rejects more than one decimal mark", () => {
    for (const bad of ["12,5,0", "12.5.0", "1,234.50", "1.234,50", "12,50.1"]) assert.deepEqual(parseAmount(bad), hint, bad);
  });
  it("rejects letters, signs, exponents, stray separators and bad grouping", () => {
    for (const bad of ["-5", "+5", "abc", "12 kr", "1e3", ",5", ".5", "5,", "5.", "1_000", "1'000", "12 34", "1 23,50", "1 2345", "kr12"]) {
      assert.deepEqual(parseAmount(bad), hint, bad);
    }
  });
  it("rejects more than 2 decimals, with the hint", () => {
    const r = parseAmount("1,234");
    assert.equal(r.ok, false);
    assert.match((r as { message: string }).message, /at most 2 decimals/);
    assert.match((r as { message: string }).message, /Use a comma before the öre, like 12,50\./);
    assert.equal(parseAmount("1.234").ok, false);
    assert.equal(parseAmount("1 000,001").ok, false);
  });
  it("says what is wrong when empty or zero", () => {
    assert.deepEqual(parseAmount("  "), { ok: false, message: "Enter the amount." });
    assert.deepEqual(parseAmount("0"), { ok: false, message: "Enter an amount greater than 0." });
    assert.deepEqual(parseAmount("0,00"), { ok: false, message: "Enter an amount greater than 0." });
  });
});

describe("amountToInput", () => {
  it("shows an API amount as editable text with a decimal comma", () => {
    assert.equal(amountToInput("4350.00"), "4350,00");
    assert.equal(amountToInput("12"), "12");
    assert.equal(amountToInput("0.50"), "0,50");
  });
});
