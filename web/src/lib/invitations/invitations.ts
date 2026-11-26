import type { InvitationResponse } from "@/lib/api";
import type { InvitationStatus } from "@/components/ui/status-chip";

/** The API's per-invitation resend cooldown. A longer `Retry-After` means the daily cap was hit. */
export const RESEND_COOLDOWN_MAX_SECONDS = 60 * 60;

/** The clock, read from event handlers and effects (never while rendering). */
export const nowMs = (): number => Date.now();

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

/** Validates the invite form's email (docs/design/households.md 6.4). Returns the message, or null. */
export function validateInviteEmail(raw: string): string | null {
  const email = raw.trim();
  if (email === "") return "Enter the email address to invite.";
  if (email.length > 254 || !EMAIL_RE.test(email)) return "Enter an email address like name@example.com.";
  return null;
}

/**
 * The status to show. The API expires old invitations when it lists them, but a page can sit open
 * past an expiry, so a pending row whose date has passed is shown as expired.
 */
export function displayStatus(inv: Pick<InvitationResponse, "status" | "expires_at">, now: number): InvitationStatus {
  if (inv.status === "pending" && Date.parse(inv.expires_at) <= now) return "expired";
  return inv.status;
}

/** Pending and expired invitations can be resent or revoked; the rest are final. */
export const isActionable = (status: InvitationStatus): boolean => status === "pending" || status === "expired";

/** "Expires 3 Dec 2026", "Expired 19 Nov 2026", "Accepted 14 Nov 2026". `date` formats an ISO string. */
export function dateLabel(
  inv: Pick<InvitationResponse, "expires_at" | "responded_at">,
  status: InvitationStatus,
  date: (iso: string) => string,
): string {
  switch (status) {
    case "pending":
      return `Expires ${date(inv.expires_at)}`;
    case "expired":
      return `Expired ${date(inv.expires_at)}`;
    case "accepted":
      return inv.responded_at ? `Accepted ${date(inv.responded_at)}` : "Accepted";
    case "declined":
      return inv.responded_at ? `Declined ${date(inv.responded_at)}` : "Declined";
    case "revoked":
      return inv.responded_at ? `Revoked ${date(inv.responded_at)}` : "Revoked";
  }
}

/** Seconds from a `Retry-After` header value (delay-seconds form only), or null when missing or unusable. */
export function parseRetryAfter(value: string | null | undefined): number | null {
  if (value === null || value === undefined || !/^\d{1,7}$/.test(value.trim())) return null;
  return Number(value.trim());
}

export type ResendLimit =
  /** A short wait: shown as a live countdown, and Resend stays off until it ends. */
  | { kind: "countdown"; seconds: number }
  /** The daily cap, or a wait the server did not state: plain text. */
  | { kind: "text"; text: string };

/** Turns a 429's `Retry-After` into what the row shows. */
export function resendLimit(retryAfter: number | null): ResendLimit {
  if (retryAfter === null || retryAfter <= 0) {
    return { kind: "text", text: "You can resend this invitation up to 3 times a day. Try again later." };
  }
  if (retryAfter < RESEND_COOLDOWN_MAX_SECONDS) return { kind: "countdown", seconds: retryAfter };
  const hours = Math.max(1, Math.round(retryAfter / 3600));
  return {
    kind: "text",
    text: `You can resend this invitation up to 3 times a day. Try again in about ${hours} ${hours === 1 ? "hour" : "hours"}.`,
  };
}

/** "42 seconds", "1 minute 5 seconds": the countdown as words. */
export function waitLabel(seconds: number): string {
  if (seconds < 60) return `${seconds} ${seconds === 1 ? "second" : "seconds"}`;
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  const minutes = `${m} ${m === 1 ? "minute" : "minutes"}`;
  return s === 0 ? minutes : `${minutes} ${s} ${s === 1 ? "second" : "seconds"}`;
}

/** The `code` of an RFC 7807 body (`already_invited`, `email_not_sent`, ...), when the API sent one. */
export function problemCode(error: unknown): string | undefined {
  if (typeof error === "object" && error !== null && "code" in error) {
    const code = (error as { code?: unknown }).code;
    if (typeof code === "string") return code;
  }
  return undefined;
}

/** Newest first, like the API's order (created_at descending). Used to merge a freshly created row into a loaded list. */
export function mergeInvitations(first: InvitationResponse[], rest: InvitationResponse[]): InvitationResponse[] {
  const seen = new Set<string>();
  const out: InvitationResponse[] = [];
  for (const inv of [...first, ...rest]) {
    if (seen.has(inv.id)) continue;
    seen.add(inv.id);
    out.push(inv);
  }
  return out;
}
