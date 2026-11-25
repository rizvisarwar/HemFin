/**
 * The address a confirmation email was just sent to, kept in sessionStorage (not in the URL, so it
 * does not end up in history, logs or referrers) for the "Check your email" page.
 */
export const PENDING_EMAIL_KEY = "hemfin-pending-email";
/** Epoch ms of the last send, so the resend cooldown survives a reload. */
export const LAST_SENT_KEY = "hemfin-pending-sent-at";
export const RESEND_COOLDOWN_SECONDS = 60;

/** Seconds left of the cooldown (0 when a resend is allowed). Pure: easy to test. */
export function cooldownRemaining(lastSentAt: number | null, now: number, cooldown = RESEND_COOLDOWN_SECONDS): number {
  if (lastSentAt === null || Number.isNaN(lastSentAt)) return 0;
  return Math.max(0, Math.ceil(cooldown - (now - lastSentAt) / 1000));
}
