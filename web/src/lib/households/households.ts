import type { MemberResponse, Role } from "@/lib/api";

/** The household name limit, counted in code points like the API does. */
export const HOUSEHOLD_NAME_MAX = 80;
/** The name counter shows from this many characters (docs/design/households.md 6.2). */
export const NAME_COUNTER_FROM = 60;

export const ROLE_LABEL: Record<Role, string> = { owner: "Owner", admin: "Admin", member: "Member" };

/** Characters as a person counts them: an emoji or surrogate pair is one. */
export function codePointLength(text: string): number {
  return [...text].length;
}

/** Shortens by code point, never splitting an emoji or a surrogate pair. The full text belongs in `title`. */
export function truncateCodePoints(text: string, max: number): string {
  const chars = [...text];
  return chars.length > max ? `${chars.slice(0, max).join("")}…` : text;
}

/** Validates a household name (trimmed). Returns the message to show under the field, or null. */
export function validateHouseholdName(raw: string): string | null {
  const name = raw.trim();
  if (name === "") return "Enter a name for the household.";
  if (codePointLength(name) > HOUSEHOLD_NAME_MAX) return `Use at most ${HOUSEHOLD_NAME_MAX} characters.`;
  return null;
}

/** "1 member", "4 members". */
export function memberCountLabel(count: number, locale = "en"): string {
  const one = new Intl.PluralRules(locale).select(count) === "one";
  return `${count} ${one ? "member" : "members"}`;
}

const collator = new Intl.Collator("en", { sensitivity: "base", numeric: true });
export const compareNames = (a: string, b: string): number => collator.compare(a, b);

const ROLE_ORDER: Record<Role, number> = { owner: 0, admin: 1, member: 2 };

/** Owner first, then admins, then members; by name within a group. */
export function sortMembers(members: MemberResponse[]): MemberResponse[] {
  return [...members].sort(
    (a, b) => ROLE_ORDER[a.role] - ROLE_ORDER[b.role] || compareNames(displayName(a), displayName(b)),
  );
}

/** A member's display name, or their email when they have not set one. */
export function displayName(member: Pick<MemberResponse, "display_name" | "email">): string {
  const name = member.display_name?.trim();
  return name ? name : member.email;
}

/** Up to two initials for the avatar circle. */
export function initials(member: Pick<MemberResponse, "display_name" | "email">): string {
  const words = displayName(member)
    .split(/[\s@.]+/)
    .filter(Boolean);
  const letters = (words.length > 1 ? [words[0], words[1]] : [words[0] ?? "?"]).map((w) => [...w][0] ?? "");
  return letters.join("").toUpperCase().slice(0, 2);
}

/** What a viewer may do to one row. The API stays the authority; this only hides actions. */
export interface MemberActions {
  changeRole: boolean;
  remove: boolean;
}

/**
 * docs/design/households.md section 4:
 *  - the viewer's own row and the owner's row have no actions (leaving is in Settings, ownership moves by transfer),
 *  - the owner changes roles and removes admins and members,
 *  - an admin removes members only.
 */
export function memberActions(viewerRole: Role, viewerId: string, target: Pick<MemberResponse, "user_id" | "role">): MemberActions {
  if (target.user_id === viewerId || target.role === "owner") return { changeRole: false, remove: false };
  if (viewerRole === "owner") return { changeRole: true, remove: true };
  if (viewerRole === "admin" && target.role === "member") return { changeRole: false, remove: true };
  return { changeRole: false, remove: false };
}

export const canManageMembers = (role: Role): boolean => role === "owner" || role === "admin";
export const canRename = canManageMembers;
export const canInvite = canManageMembers;

/** The message from an RFC 7807 body's `detail`, when the API sent one. */
export function problemDetail(error: unknown): string | undefined {
  if (typeof error === "object" && error !== null && "detail" in error) {
    const detail = (error as { detail?: unknown }).detail;
    if (typeof detail === "string" && detail.trim() !== "") return detail;
  }
  return undefined;
}
