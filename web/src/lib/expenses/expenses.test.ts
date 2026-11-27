import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  activeFilterCount,
  DEFAULT_FILTERS,
  expenseFiltersToQuery,
  filterButtonLabel,
  isDefaultFilters,
  validateExpense,
  type ExpenseFormValues,
} from "./expenses.ts";

const opts = { today: "2026-11-27" };
const values: ExpenseFormValues = {
  amount: "12.50",
  category_id: "c1",
  spent_on: "2026-11-27",
  description: "  Groceries ",
  merchant: "",
  contract_id: "",
  member_user_id: "",
};

describe("expense filters", () => {
  it("the defaults send nothing", () => {
    assert.deepEqual(expenseFiltersToQuery(DEFAULT_FILTERS), {
      from: undefined,
      to: undefined,
      category: undefined,
      member_user_id: undefined,
      contract_id: undefined,
    });
    assert.equal(isDefaultFilters(DEFAULT_FILTERS), true);
  });
  it("maps the applies-to values to member_user_id", () => {
    assert.equal(expenseFiltersToQuery({ ...DEFAULT_FILTERS, applies: "household" }).member_user_id, "none");
    assert.equal(expenseFiltersToQuery({ ...DEFAULT_FILTERS, applies: "u1" }).member_user_id, "u1");
  });
  it("sends dates, category and contract", () => {
    const q = expenseFiltersToQuery({ ...DEFAULT_FILTERS, from: "2026-11-01", to: "2026-11-30", category: "food", contract_id: "k1" });
    assert.deepEqual([q.from, q.to, q.category, q.contract_id], ["2026-11-01", "2026-11-30", "food", "k1"]);
  });
  it("does not send a reversed range", () => {
    const q = expenseFiltersToQuery({ ...DEFAULT_FILTERS, from: "2026-11-30", to: "2026-11-01" });
    assert.equal(q.from, undefined);
    assert.equal(q.to, undefined);
  });
  it("counts the filters in the button label", () => {
    assert.equal(filterButtonLabel(DEFAULT_FILTERS), "Filters");
    assert.equal(activeFilterCount({ ...DEFAULT_FILTERS, category: "food", applies: "household", contract_id: "k" }), 3);
    assert.equal(filterButtonLabel({ ...DEFAULT_FILTERS, from: "2026-11-01" }), "Filters: 1 applied");
  });
});

describe("validateExpense", () => {
  it("builds the payload: trimmed text, nulls for empty, the amount as a string", () => {
    const r = validateExpense(values, opts);
    assert.deepEqual(r.errors, {});
    assert.deepEqual(r.payload, {
      category_id: "c1",
      amount: "12.50",
      spent_on: "2026-11-27",
      description: "Groceries",
      merchant: null,
      contract_id: null,
      member_user_id: null,
    });
  });
  it("asks for the amount, the category and the date, in the spec's words", () => {
    const r = validateExpense({ ...values, amount: "", category_id: "", spent_on: "" }, opts);
    assert.equal(r.payload, undefined);
    assert.deepEqual(r.errors, { amount: "Enter the amount.", category_id: "Choose a category.", spent_on: "Enter the date you paid." });
  });
  it("rejects a comma in an English locale and too many decimals", () => {
    assert.equal(validateExpense({ ...values, amount: "12,50" }, opts).errors.amount, undefined);
    assert.match(validateExpense({ ...values, amount: "1.234" }, opts).errors.amount ?? "", /at most 2 decimals/);
  });
  it("accepts tomorrow, refuses a date two days ahead", () => {
    assert.deepEqual(validateExpense({ ...values, spent_on: "2026-11-28" }, opts).errors, {});
    assert.equal(validateExpense({ ...values, spent_on: "2026-11-29" }, opts).errors.spent_on, "The date cannot be more than a day in the future.");
  });
  it("sends a chosen contract and member", () => {
    const r = validateExpense({ ...values, contract_id: "k1", member_user_id: "u1" }, opts);
    assert.equal(r.payload?.contract_id, "k1");
    assert.equal(r.payload?.member_user_id, "u1");
  });
});
