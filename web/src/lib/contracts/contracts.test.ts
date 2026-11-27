import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  filterButtonLabel,
  filtersToQuery,
  noticeChip,
  noticePassed,
  paymentChip,
  renewalChip,
  validateContract,
  DEFAULT_FILTERS,
  type ContractFormValues,
} from "./contracts.ts";
import { daysBetween } from "../finance/common.ts";

const TODAY = "2026-11-27";

describe("due chips", () => {
  it("counts calendar days", () => {
    assert.equal(daysBetween("2026-11-27", "2026-12-03"), 6);
    assert.equal(daysBetween("2026-12-28", "2027-01-02"), 5);
    assert.equal(daysBetween("2026-11-27", "2026-11-26"), -1);
  });
  it("warns for a payment within 7 days, with the right words", () => {
    assert.equal(paymentChip("2026-11-27", TODAY)?.text, "Due today");
    assert.equal(paymentChip("2026-11-28", TODAY)?.text, "Due tomorrow");
    assert.equal(paymentChip("2026-12-03", TODAY)?.text, "Due in 6 days");
    assert.equal(paymentChip("2026-12-04", TODAY)?.text, "Due in 7 days");
    assert.equal(paymentChip("2026-12-05", TODAY), null);
    assert.equal(paymentChip(null, TODAY), null);
  });
  it("warns for a renewal within 7 days", () => {
    assert.equal(renewalChip("2026-12-03", TODAY)?.text, "Renews in 6 days");
    assert.equal(renewalChip("2027-01-01", TODAY), null);
  });
  it("warns for a notice deadline within 30 days, and treats a passed one as plain text", () => {
    assert.equal(noticeChip("2026-12-02", TODAY)?.text, "Notice deadline soon, in 5 days");
    assert.equal(noticeChip("2026-11-27", TODAY)?.text, "Notice deadline soon, today");
    assert.equal(noticeChip("2026-12-27", TODAY)?.text, "Notice deadline soon, in 30 days");
    assert.equal(noticeChip("2026-12-28", TODAY), null);
    assert.equal(noticeChip("2026-11-20", TODAY), null);
    assert.equal(noticePassed("2026-11-20", TODAY), true);
    assert.equal(noticePassed("2026-11-27", TODAY), false);
  });
});

describe("filters", () => {
  it("maps the Applies to values to the API query", () => {
    assert.deepEqual(filtersToQuery(DEFAULT_FILTERS), { status: "active", category: undefined, member_user_id: undefined });
    assert.equal(filtersToQuery({ ...DEFAULT_FILTERS, applies: "household" }).member_user_id, "none");
    assert.equal(filtersToQuery({ ...DEFAULT_FILTERS, applies: "abc" }).member_user_id, "abc");
    assert.equal(filtersToQuery({ ...DEFAULT_FILTERS, status: "all" }).status, undefined);
    assert.equal(filtersToQuery({ ...DEFAULT_FILTERS, category: "insurance" }).category, "insurance");
  });
  it("labels the phone filter button", () => {
    assert.equal(filterButtonLabel(DEFAULT_FILTERS), "Filters: Active");
    assert.equal(filterButtonLabel({ status: "all", category: "food", applies: "household" }), "Filters: All, 2 more");
  });
});

const values: ContractFormValues = {
  name: " Car insurance ",
  provider: "  ",
  category_id: "c1",
  amount: "4350.50",
  frequency: "annual",
  start_date: "2026-01-01",
  end_date: "",
  auto_renew: true,
  renewal_term_months: "12",
  notice_period_days: "30",
  member_user_id: "",
  notes: "",
};
describe("validateContract", () => {
  it("builds the API body: amount as a string, empty optionals null", () => {
    const r = validateContract(values);
    assert.deepEqual(r.errors, {});
    assert.deepEqual(r.payload, {
      category_id: "c1",
      name: "Car insurance",
      provider: null,
      amount: "4350.50",
      frequency: "annual",
      start_date: "2026-01-01",
      end_date: null,
      auto_renew: true,
      renewal_term_months: 12,
      notice_period_days: 30,
      member_user_id: null,
      notes: null,
    });
  });
  it("drops the renewal term when auto-renew is off", () => {
    const r = validateContract({ ...values, auto_renew: false, renewal_term_months: "abc" });
    assert.equal(r.payload?.renewal_term_months, null);
  });
  it("reports each rule with the spec's wording", () => {
    const r = validateContract(
      {
        ...values,
        name: " ",
        category_id: "",
        amount: "",
        start_date: "",
        renewal_term_months: "121",
        notice_period_days: "1.5",
      },
    );
    assert.equal(r.payload, undefined);
    assert.deepEqual(r.errors, {
      name: "Enter a name for the contract.",
      category_id: "Choose a category.",
      amount: "Enter the amount.",
      start_date: "Enter the start date.",
      renewal_term_months: "Enter a whole number of months, from 1 to 120.",
      notice_period_days: "Enter a whole number of days, for example 30.",
    });
    assert.equal(
      validateContract({ ...values, end_date: "2025-12-31" }).errors.end_date,
      "The end date must be on or after the start date.",
    );
    assert.equal(validateContract({ ...values, end_date: "2026-01-01" }).errors.end_date, undefined);
  });
});
