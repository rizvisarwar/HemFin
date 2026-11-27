import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { formatCalendarDate, formatMoney, makeFormatter } from "./format.ts";

// Intl puts no-break spaces in sv-SE numbers, so an amount cannot wrap in the middle.
const NBSP = " ";

describe("formatMoney (sv-SE, SEK)", () => {
  it("formats SEK like 1 234,50 kr with no-break spaces", () => {
    assert.equal(formatMoney("1234.5"), `1${NBSP}234,50${NBSP}kr`);
    assert.equal(formatMoney("0"), `0,00${NBSP}kr`);
    assert.doesNotMatch(formatMoney("1234567.89"), / /); // no regular (breaking) space anywhere
  });
  it("formats a decimal string without float loss", () => {
    assert.equal(formatMoney("9007199254740993.01"), `9${NBSP}007${NBSP}199${NBSP}254${NBSP}740${NBSP}993,01${NBSP}kr`);
  });
  it("shows a sign for income", () => {
    assert.equal(formatMoney("20", "SEK", { signDisplay: "always" }), `+20,00${NBSP}kr`);
  });
  it("shows another stored currency with its code, so it is not mistaken for SEK", () => {
    assert.equal(formatMoney("5", "EUR"), `5,00${NBSP}EUR`);
  });
});

describe("makeFormatter", () => {
  const f = makeFormatter();
  it("formats money, keeping a record's own currency", () => {
    assert.equal(f.money("1240.5"), `1${NBSP}240,50${NBSP}kr`);
    assert.equal(f.money("5", { currency: "USD" }), `5,00${NBSP}USD`);
  });
  it("never throws for a bad currency code", () => {
    assert.equal(f.money("2", { currency: "??" }), "2");
  });
  it("formats dates in sv-SE", () => {
    assert.match(f.date("2026-11-26T10:00:00Z"), /^26 nov\.? 2026$/);
  });
});

describe("calendar dates", () => {
  it("use the Swedish short month, day first", () => {
    assert.equal(formatCalendarDate("2027-01-01"), "1 jan. 2027");
    assert.equal(formatCalendarDate("2026-12-03"), "3 dec. 2026");
    assert.equal(makeFormatter().calendarDate("2027-01-01"), "1 jan. 2027");
  });
  it("never move a day, whatever the time zone", () => {
    assert.equal(formatCalendarDate("2026-03-01"), "1 mars 2026");
  });
});
