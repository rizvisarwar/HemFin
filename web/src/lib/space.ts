import type { SpaceSummary } from "@/components/layout/types";

/** Name of the cookie that stores the active space id. */
export const SPACE_COOKIE = "hemfin-space";

/**
 * Static placeholder spaces. There are no real spaces until Phase 2 (HEM-003
 * PM decision), so the switcher shows "Personal" plus one sample household.
 */
export const PLACEHOLDER_SPACES: SpaceSummary[] = [
  { id: "personal", name: "Personal", type: "personal", role: "owner" },
  {
    id: "sample-household",
    name: "Sample household",
    type: "household",
    role: "member",
  },
];

export const DEFAULT_SPACE_ID = "personal";

export function resolveSpaceId(value: string | undefined): string {
  return PLACEHOLDER_SPACES.some((s) => s.id === value)
    ? (value as string)
    : DEFAULT_SPACE_ID;
}
