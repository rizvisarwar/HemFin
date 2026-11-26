import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  CHECK_EMAIL_MESSAGE,
  GENERIC_SIGN_IN_ERROR,
  mapAuthError,
  NETWORK_ERROR,
  RATE_LIMIT_ERROR,
  RESET_REQUESTED_MESSAGE,
} from "./errors.ts";

describe("mapAuthError never reveals whether an account exists", () => {
  it("sign-in: wrong password, unknown user and unconfirmed email read the same", () => {
    const outcomes = [
      { code: "invalid_credentials", status: 400, message: "Invalid login credentials" },
      { code: "user_not_found", status: 400, message: "User not found" },
      { code: "email_not_confirmed", status: 400, message: "Email not confirmed" },
    ].map((e) => mapAuthError(e, "sign-in"));
    for (const o of outcomes) {
      assert.equal(o.message, GENERIC_SIGN_IN_ERROR);
      assert.equal(o.treatAsSuccess, false);
    }
  });

  it("sign-up: an existing account looks like a normal sign-up", () => {
    for (const e of [
      { code: "user_already_exists", status: 422 },
      { code: "email_exists", status: 422 },
      { message: "User already registered" },
    ]) {
      const o = mapAuthError(e, "sign-up");
      assert.equal(o.treatAsSuccess, true);
      assert.equal(o.message, CHECK_EMAIL_MESSAGE);
      assert.doesNotMatch(o.message, /already|exists|registered/i);
    }
  });

  it("forgot password and resend always look successful", () => {
    for (const e of [{ code: "user_not_found" }, { code: "unexpected_failure", status: 500 }, {}]) {
      const o = mapAuthError(e, "forgot-password");
      assert.equal(o.treatAsSuccess, true);
      assert.equal(o.message, RESET_REQUESTED_MESSAGE);
      assert.equal(mapAuthError(e, "resend").treatAsSuccess, true);
    }
  });

  it("no message mentions the account state", () => {
    const flows = ["sign-in", "sign-up", "forgot-password", "reset-password", "resend", "oauth"] as const;
    for (const flow of flows) {
      for (const e of [{ code: "invalid_credentials" }, { code: "user_already_exists" }, { code: "email_not_confirmed" }]) {
        assert.doesNotMatch(mapAuthError(e, flow).message, /no account|not registered|does not exist|already (has|exists|registered)/i);
      }
    }
  });
});

describe("mapAuthError generic cases", () => {
  it("rate limits and network failures are reported honestly in every flow", () => {
    for (const flow of ["sign-in", "sign-up", "forgot-password", "reset-password", "resend"] as const) {
      assert.equal(mapAuthError({ code: "over_request_rate_limit", status: 429 }, flow).message, RATE_LIMIT_ERROR);
      assert.equal(mapAuthError({ status: 429 }, flow).message, RATE_LIMIT_ERROR);
      assert.equal(mapAuthError({ name: "AuthRetryableFetchError", message: "Failed to fetch", status: 0 }, flow).message, NETWORK_ERROR);
    }
  });

  it("weak and reused passwords get actionable copy; expired links say so", () => {
    assert.match(mapAuthError({ code: "weak_password" }, "sign-up").message, /stronger password/);
    assert.match(mapAuthError({ code: "weak_password" }, "reset-password").message, /stronger password/);
    assert.match(mapAuthError({ code: "same_password" }, "reset-password").message, /not used before/);
    assert.match(mapAuthError({ code: "session_not_found" }, "reset-password").message, /expired/);
  });
});
