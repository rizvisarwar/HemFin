import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { isEmailValid, isPasswordValid, passwordRuleResults } from "./password.ts";
import { cooldownRemaining, parsePending } from "./pending.ts";

describe("password rules", () => {
  it("accepts a password with length, lower, upper and a digit", () => {
    assert.equal(isPasswordValid("Passw0rd-ok"), true);
  });
  it("rejects each missing rule", () => {
    for (const bad of ["Sh0rt", "alllowercase1", "ALLUPPERCASE1", "NoDigitsHere"]) assert.equal(isPasswordValid(bad), false, bad);
  });
  it("reports which rules are met", () => {
    const met = Object.fromEntries(passwordRuleResults("abc").map((r) => [r.id, r.met]));
    assert.deepEqual(met, { length: false, lower: true, upper: false, digit: false });
  });
});

describe("email check", () => {
  it("is a light sanity check only", () => {
    assert.equal(isEmailValid("name@example.com"), true);
    for (const bad of ["", "name", "name@", "@example.com", "a b@example.com"]) assert.equal(isEmailValid(bad), false, bad);
  });
});

describe("resend cooldown", () => {
  it("counts down from the last send", () => {
    assert.equal(cooldownRemaining(1000, 1000), 60);
    assert.equal(cooldownRemaining(1000, 31_000), 30);
    assert.equal(cooldownRemaining(1000, 61_000), 0);
    assert.equal(cooldownRemaining(null, 5), 0);
  });
  it("parses the stored snapshot", () => {
    assert.deepEqual(parsePending("a@b.test\t123"), { email: "a@b.test", sentAt: 123 });
    assert.deepEqual(parsePending("\t"), { email: null, sentAt: null });
  });
});
