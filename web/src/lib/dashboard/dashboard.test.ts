import assert from "node:assert/strict";
import { test } from "node:test";
import { daysUntil, dueChip, isFirstRun, isZeroAmount, monthLabel, unconvertedHint } from "./dashboard.ts";

const money = (amount: string) => ({ amount, currency: "EUR" });
const empty = {
  month: "2026-11",
  base_currency: "EUR",
  spent_this_month: money("0.00"),
  recurring_monthly: money("0.00"),
  income_this_month: money("0.00"),
  upcoming: [],
  has_records: false,
  unconverted_count: 0,
};

test("month label and day counts", () => {
  assert.equal(monthLabel("2026-11"), "November 2026");
  assert.equal(daysUntil("2026-12-03", "2026-11-27"), 6);
  assert.equal(daysUntil("2027-01-01", "2026-12-31"), 1);
});

test("zero amounts", () => {
  assert.ok(isZeroAmount("0.00"));
  assert.ok(isZeroAmount("0"));
  assert.ok(!isZeroAmount("0.01"));
  assert.ok(!isZeroAmount("10.00"));
});

test("first run follows has_records, not the totals", () => {
  assert.ok(isFirstRun(empty));
  assert.ok(!isFirstRun({ ...empty, has_records: true })); // records only in another month: totals are zero
});

test("unconverted hint uses singular and plural copy", () => {
  assert.match(unconvertedHint(1, "EUR"), /^1 amount is not in EUR, because no rate was found for its date/);
  assert.match(unconvertedHint(3, "SEK"), /^3 amounts are not in SEK, because no rate was found for their dates/);
});

test("due chips follow the 7 and 30 day thresholds", () => {
  assert.equal(dueChip("payment", 6)?.text, "Due in 6 days");
  assert.equal(dueChip("payment", 1)?.text, "Due tomorrow");
  assert.equal(dueChip("payment", 0)?.text, "Due today");
  assert.equal(dueChip("payment", 8), null);
  assert.equal(dueChip("renewal", 6)?.text, "Renews in 6 days");
  assert.equal(dueChip("renewal", 20), null);
  assert.equal(dueChip("notice_deadline", 5)?.text, "Notice deadline soon, in 5 days");
  assert.equal(dueChip("notice_deadline", 31), null);
});
