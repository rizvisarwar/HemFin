import assert from "node:assert/strict";
import { test } from "node:test";
import {
  codePointLength,
  initials,
  memberActions,
  memberCountLabel,
  problemDetail,
  sortMembers,
  truncateCodePoints,
  validateHouseholdName,
} from "./households.ts";

const member = (user_id: string, role: "owner" | "admin" | "member", name: string | null = null) => ({
  user_id,
  role,
  display_name: name,
  email: `${user_id}@example.com`,
  joined_at: "2026-11-01T10:00:00Z",
});

test("names are counted and shortened by code point", () => {
  assert.equal(codePointLength("a😀b"), 3);
  assert.equal(truncateCodePoints("😀😀😀😀", 2), "😀😀…");
  assert.equal(truncateCodePoints("short", 14), "short");
});

test("name validation trims and counts code points", () => {
  assert.equal(validateHouseholdName("   "), "Enter a name for the household.");
  assert.equal(validateHouseholdName(" The Lee family "), null);
  assert.equal(validateHouseholdName("😀".repeat(80)), null);
  assert.equal(validateHouseholdName("😀".repeat(81)), "Use at most 80 characters.");
});

test("member counts use plural rules", () => {
  assert.equal(memberCountLabel(1), "1 member");
  assert.equal(memberCountLabel(4), "4 members");
});

test("members sort owner, admins, members, then by name", () => {
  const sorted = sortMembers([member("c", "member", "Zed"), member("b", "admin", "Bo"), member("a", "owner", "Al"), member("d", "member", "Amy")]);
  assert.deepEqual(sorted.map((m) => m.user_id), ["a", "b", "d", "c"]);
});

test("initials fall back to the email", () => {
  assert.equal(initials(member("x", "member", "Alex Lee")), "AL");
  assert.equal(initials({ display_name: null, email: "sam@example.com" }), "SE");
});

test("row actions follow the role table", () => {
  const owner = member("o", "owner");
  const admin = member("a", "admin");
  const plain = member("m", "member");
  // Owner viewing
  assert.deepEqual(memberActions("owner", "o", owner), { changeRole: false, remove: false });
  assert.deepEqual(memberActions("owner", "o", admin), { changeRole: true, remove: true });
  assert.deepEqual(memberActions("owner", "o", plain), { changeRole: true, remove: true });
  // Admin viewing: remove members only, never admins, the owner or self
  assert.deepEqual(memberActions("admin", "a", owner), { changeRole: false, remove: false });
  assert.deepEqual(memberActions("admin", "a", admin), { changeRole: false, remove: false });
  assert.deepEqual(memberActions("admin", "a", member("a2", "admin")), { changeRole: false, remove: false });
  assert.deepEqual(memberActions("admin", "a", plain), { changeRole: false, remove: true });
  // Member viewing: nothing
  assert.deepEqual(memberActions("member", "m", owner), { changeRole: false, remove: false });
  assert.deepEqual(memberActions("member", "m", member("m2", "member")), { changeRole: false, remove: false });
});

test("problemDetail reads only a non-empty string detail", () => {
  assert.equal(problemDetail({ detail: "Insufficient role for this action." }), "Insufficient role for this action.");
  assert.equal(problemDetail({ detail: [] }), undefined);
  assert.equal(problemDetail(null), undefined);
});
