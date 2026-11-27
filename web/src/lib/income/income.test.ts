import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  DEFAULT_ENTRY_FILTERS,
  entryFilterButtonLabel,
  entryFiltersToQuery,
  sourceOptionLabel,
  validateEntry,
  validateSource,
  type EntryFormValues,
  type SourceFormValues,
} from "./income.ts";

const opts = { today: "2026-11-27" };

describe("entry filters", () => {
  it("send only what is set, and not a reversed range", () => {
    assert.deepEqual(entryFiltersToQuery(DEFAULT_ENTRY_FILTERS), { from: undefined, to: undefined, source_id: undefined });
    assert.deepEqual(entryFiltersToQuery({ from: "2026-11-01", to: "2026-11-30", source_id: "s1" }), {
      from: "2026-11-01",
      to: "2026-11-30",
      source_id: "s1",
    });
    assert.equal(entryFiltersToQuery({ from: "2026-12-01", to: "2026-11-30", source_id: "" }).from, undefined);
  });
  it("labels the filter button with a count", () => {
    assert.equal(entryFilterButtonLabel(DEFAULT_ENTRY_FILTERS), "Filters");
    assert.equal(entryFilterButtonLabel({ from: "2026-11-01", to: "", source_id: "s1" }), "Filters: 2 applied");
  });
});

describe("validateEntry", () => {
  const v: EntryFormValues = { amount: "2850", received_on: "2026-11-27", source_id: "", description: " ", member_user_id: "" };
  it("builds the payload with nulls for the optional fields", () => {
    assert.deepEqual(validateEntry(v, opts).payload, {
      amount: "2850",
      received_on: "2026-11-27",
      source_id: null,
      description: null,
      member_user_id: null,
    });
  });
  it("uses the spec's messages", () => {
    const r = validateEntry({ ...v, amount: "0", received_on: "" }, opts);
    assert.deepEqual(r.errors, { amount: "Enter an amount greater than 0.", received_on: "Enter the date you received it." });
    assert.equal(validateEntry({ ...v, received_on: "2026-12-05" }, opts).errors.received_on, "The date cannot be more than a day in the future.");
  });
  it("sends a chosen source", () => {
    assert.equal(validateEntry({ ...v, source_id: "s1" }, opts).payload?.source_id, "s1");
  });
});

describe("validateSource", () => {
  const v: SourceFormValues = { name: " Salary ", type: "salary", amount: "2850.00", frequency: "monthly", member_user_id: "", active: true };
  it("builds the payload", () => {
    assert.deepEqual(validateSource(v).payload, {
      name: "Salary",
      type: "salary",
      amount: "2850.00",
      frequency: "monthly",
      member_user_id: null,
      active: true,
    });
  });
  it("asks for a name and an amount", () => {
    assert.deepEqual(validateSource({ ...v, name: " ", amount: "" }).errors, {
      name: "Enter a name for the source.",
      amount: "Enter the amount.",
    });
  });
  it("keeps active false when the source is paused", () => {
    assert.equal(validateSource({ ...v, active: false }).payload?.active, false);
  });
});

describe("sourceOptionLabel", () => {
  it("marks a paused source", () => {
    assert.equal(sourceOptionLabel({ name: "Salary", active: true }), "Salary");
    assert.equal(sourceOptionLabel({ name: "Salary", active: false }), "Salary (paused)");
  });
});
