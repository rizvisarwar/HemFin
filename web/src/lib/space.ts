import type { SpaceSummary } from "@/components/layout/types";

/** Name of the cookie that stores the active space id. */
export const SPACE_COOKIE = "hemfin-space";

/**
 * The active space id: the stored one if it is still one of the user's spaces, otherwise their
 * personal space (every user has exactly one), otherwise the first space.
 */
export function resolveSpaceId(value: string | undefined, spaces: SpaceSummary[]): string {
  if (value && spaces.some((s) => s.id === value)) return value;
  return (spaces.find((s) => s.type === "personal") ?? spaces[0])?.id ?? "";
}
