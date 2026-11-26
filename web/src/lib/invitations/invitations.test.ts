import assert from "node:assert/strict";
import { test } from "node:test";
import {
  dateLabel,
  displayStatus,
  isActionable,
  mergeInvitations,
  parseRetryAfter,
  problemCode,
  resendLimit,
  validateInviteEmail,
  waitLabel,
} from "./invitations.ts";

const inv = (id: string, over: Record<string, unknown> = {}) => ({
  id,
  email: `${id}@example.com`,
  role: "member" as const,
  status: "pending" as const,
  created_at: "2026-11-01T10:00:00Z",
  expires_at: "2026-12-03T10:00:00Z",
  responded_at: null,
  invited_by: "u1",
  ...over,
});

test("validateInviteEmail uses the spec messages", () => {
  assert.equal(validateInviteEmail("  "), "Enter the email address to invite.");
  assert.equal(validateInviteEmail("sam"), "Enter an email address like name@example.com.");
  assert.equal(validateInviteEmail("sam@example"), "Enter an email address like name@example.com.");
  assert.equal(validateInviteEmail(" sam@example.com "), null);
});

test("displayStatus shows a pending invitation past its date as expired", () => {
  const now = Date.parse("2026-12-04T00:00:00Z");
  assert.equal(displayStatus(inv("a"), now), "expired");
  assert.equal(displayStatus(inv("a"), Date.parse("2026-12-01T00:00:00Z")), "pending");
  assert.equal(displayStatus(inv("a", { status: "accepted" }), now), "accepted");
});

test("only pending and expired invitations have actions", () => {
  assert.deepEqual(
    (["pending", "expired", "accepted", "declined", "revoked"] as const).map(isActionable),
    [true, true, false, false, false],
  );
});

test("dateLabel", () => {
  const date = (iso: string) => iso.slice(0, 10);
  assert.equal(dateLabel(inv("a"), "pending", date), "Expires 2026-12-03");
  assert.equal(dateLabel(inv("a"), "expired", date), "Expired 2026-12-03");
  assert.equal(dateLabel(inv("a", { responded_at: "2026-11-14T09:00:00Z" }), "accepted", date), "Accepted 2026-11-14");
  assert.equal(dateLabel(inv("a"), "revoked", date), "Revoked");
});

test("parseRetryAfter reads seconds only", () => {
  assert.equal(parseRetryAfter("42"), 42);
  assert.equal(parseRetryAfter(" 7 "), 7);
  assert.equal(parseRetryAfter(null), null);
  assert.equal(parseRetryAfter("Wed, 21 Oct 2026 07:28:00 GMT"), null);
  assert.equal(parseRetryAfter("-5"), null);
});

test("resendLimit: a short wait counts down, the daily cap and unknown waits are text", () => {
  assert.deepEqual(resendLimit(42), { kind: "countdown", seconds: 42 });
  const daily = resendLimit(5 * 3600);
  assert.equal(daily.kind, "text");
  assert.match(daily.kind === "text" ? daily.text : "", /up to 3 times a day.*about 5 hours/);
  assert.equal(resendLimit(null).kind, "text");
  assert.equal(resendLimit(0).kind, "text");
});

test("waitLabel", () => {
  assert.equal(waitLabel(1), "1 second");
  assert.equal(waitLabel(42), "42 seconds");
  assert.equal(waitLabel(60), "1 minute");
  assert.equal(waitLabel(65), "1 minute 5 seconds");
});

test("problemCode", () => {
  assert.equal(problemCode({ code: "already_member", detail: "x" }), "already_member");
  assert.equal(problemCode({ detail: "x" }), undefined);
  assert.equal(problemCode(null), undefined);
});

test("mergeInvitations keeps the first copy of a row and the order", () => {
  const merged = mergeInvitations([inv("b"), inv("a")], [inv("a", { status: "revoked" }), inv("c")]);
  assert.deepEqual(merged.map((i) => i.id), ["b", "a", "c"]);
  assert.equal(merged[1].status, "pending");
});
