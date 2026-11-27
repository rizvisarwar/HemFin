import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  appliesToQuery,
  categoryGroups,
  futureDateError,
  groupByMonth,
  isUuid,
  monthTitle,
  rangeError,
  todayIso,
  FUTURE_DATE_MESSAGE,
  type CategoryLike,
} from "./common.ts";
import { financeProblem } from "./problem.ts";

const cat = (key: string, name: string, parent: string | null, system = true, kind = "expense"): CategoryLike => ({
  id: `id-${key}`,
  key,
  name,
  parent_key: parent,
  kind,
  system,
});

describe("categoryGroups", () => {
  const list = [
    cat("utility", "Utilities", null),
    cat("utility.gas", "Gas", "utility"),
    cat("insurance", "Insurance", null),
    cat("insurance.home", "Home insurance", "insurance"),
    cat("insurance.car", "Car insurance", "insurance"),
    cat("transport", "Transport", null),
    cat("pets", "Pets", null, false),
    cat("income", "Income", null, true, "income"),
  ];
  it("groups by parent in the spec's order and ends with the space's own", () => {
    const g = categoryGroups(list, "id");
    assert.deepEqual(
      g.map((x) => x.label),
      ["Insurance", "Utilities", "Transport", "Your categories"],
    );
    assert.deepEqual(g[0].options, [
      { value: "id-insurance.home", label: "Home insurance" },
      { value: "id-insurance.car", label: "Car insurance" },
    ]);
    assert.deepEqual(g[2].options, [{ value: "id-transport", label: "Transport" }]);
  });
  it("uses keys for the filter and adds an All option per group", () => {
    const g = categoryGroups(list, "key");
    assert.deepEqual(g[0].options[0], { value: "insurance", label: "All insurance" });
    assert.equal(g[0].options[1].value, "insurance.home");
  });
});

describe("dates", () => {
  it("todayIso is a calendar date in the local zone", () => {
    assert.equal(todayIso(new Date(2026, 11, 3, 23, 30)), "2026-12-03");
  });
  it("allows today and tomorrow, refuses two days ahead", () => {
    assert.equal(futureDateError("2026-11-28", "2026-11-27"), undefined);
    assert.equal(futureDateError("2026-11-29", "2026-11-27"), FUTURE_DATE_MESSAGE);
    assert.equal(futureDateError("", "2026-11-27"), undefined);
  });
  it("From must not be after To; either may be empty", () => {
    assert.equal(rangeError("2026-11-02", "2026-11-01"), "The From date must be before the To date.");
    assert.equal(rangeError("2026-11-01", "2026-11-01"), undefined);
    assert.equal(rangeError("2026-11-01", ""), undefined);
  });
  it("recognises a uuid", () => {
    assert.equal(isUuid("0b9f6a3e-3f43-4a7c-8f55-0d3a7b2c9e11"), true);
    assert.equal(isUuid("nope"), false);
    assert.equal(isUuid(null), false);
  });
});

describe("appliesToQuery", () => {
  it("maps the filter values to the API's member_user_id", () => {
    assert.equal(appliesToQuery("all"), undefined);
    assert.equal(appliesToQuery("household"), "none");
    assert.equal(appliesToQuery("user-1"), "user-1");
  });
});

describe("groupByMonth", () => {
  it("groups a newest-first list by the month in the date string", () => {
    const items = [
      { id: 1, d: "2026-11-30" },
      { id: 2, d: "2026-11-01" },
      { id: 3, d: "2026-10-31" },
    ];
    const g = groupByMonth(items, (i) => i.d);
    assert.deepEqual(
      g.map((x) => [x.key, x.items.map((i) => i.id)]),
      [
        ["2026-11", [1, 2]],
        ["2026-10", [3]],
      ],
    );
  });
  it("is empty for no items", () => {
    assert.deepEqual(groupByMonth([], () => ""), []);
  });
  it("titles a month in words, with no time zone shift", () => {
    assert.equal(monthTitle("2026-11"), "November 2026");
    assert.equal(monthTitle("2026-01"), "January 2026");
  });
});

describe("financeProblem", () => {
  it("maps validation errors to fields by API name", () => {
    const p = financeProblem(422, {
      errors: [
        { loc: ["body", "amount"], msg: "Value error, Too many decimals" },
        { loc: ["body", "currency"], msg: "Unsupported currency" },
      ],
    });
    assert.deepEqual(p.fields, { amount: "Too many decimals", currency: "Unsupported currency" });
  });
  it("maps a coded refusal to its field", () => {
    assert.deepEqual(financeProblem(422, { code: "invalid_category", detail: "Unknown category." }).fields, {
      category_id: "Unknown category.",
    });
    assert.deepEqual(financeProblem(422, { code: "invalid_member", detail: "Not a member." }).fields, {
      member_user_id: "Not a member.",
    });
    assert.deepEqual(financeProblem(422, { code: "invalid_contract", detail: "Unknown contract." }).fields, {
      contract_id: "Unknown contract.",
    });
    assert.deepEqual(financeProblem(422, { code: "invalid_source", detail: "Unknown income source." }).fields, {
      source_id: "Unknown income source.",
    });
    assert.deepEqual(financeProblem(422, { code: "invalid_amount", detail: "EUR amounts can have up to 2 decimals." }).fields, {
      amount: "EUR amounts can have up to 2 decimals.",
    });
  });
  it("puts the future-date refusal under the date it names, in the spec's words", () => {
    assert.deepEqual(financeProblem(422, { code: "date_in_future", detail: "spent_on cannot be more than a day in the future." }).fields, {
      spent_on: FUTURE_DATE_MESSAGE,
    });
    assert.deepEqual(financeProblem(422, { code: "date_in_future", detail: "received_on cannot be more than a day in the future." }).fields, {
      received_on: FUTURE_DATE_MESSAGE,
    });
  });
  it("gives a form message when no field is named", () => {
    assert.equal(financeProblem(500, {}).form, "Something went wrong. Try again in a moment.");
  });
});
