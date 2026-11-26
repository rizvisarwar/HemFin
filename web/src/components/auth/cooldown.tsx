"use client";

import * as React from "react";
import { cooldownRemaining, RESEND_COOLDOWN_SECONDS } from "@/lib/auth/pending";

/**
 * Cooldown after sending an email (check-email resend, forgot password).
 *
 * `sentAt` is the epoch ms of the last send (null before the first). Returns the seconds left and
 * a one-off polite announcement for when sending is possible again. The countdown itself is not
 * announced, only the end of it.
 */
export function useCooldown(sentAt: number | null, seconds = RESEND_COOLDOWN_SECONDS) {
  // The clock starts at the send time and is advanced by the interval below (no clock read while rendering).
  const [now, setNow] = React.useState(0);
  const [announcedFor, setAnnouncedFor] = React.useState<number | null>(null);
  const remaining = cooldownRemaining(sentAt, Math.max(now, sentAt ?? 0), seconds);
  const counting = remaining > 0;

  React.useEffect(() => {
    if (sentAt === null || !counting) return;
    const tick = () => {
      const t = Date.now();
      setNow(t);
      if (cooldownRemaining(sentAt, t, seconds) <= 0) setAnnouncedFor(sentAt);
    };
    const first = setTimeout(tick, 0);
    const timer = setInterval(tick, 1000);
    return () => {
      clearTimeout(first);
      clearInterval(timer);
    };
  }, [sentAt, counting, seconds]);

  return {
    remaining,
    announcement: sentAt !== null && announcedFor === sentAt ? "You can send the email again now." : "",
  };
}

/**
 * Visible explanation of the cooldown (normal text colour, not a dimmed button label) plus the
 * polite live announcement for when it ends.
 */
export function CooldownNote({ remaining, announcement }: { remaining: number; announcement: string }) {
  return (
    <>
      {remaining > 0 ? (
        <p className="text-small text-foreground" data-testid="cooldown-note">
          You can ask for another email in {remaining} {remaining === 1 ? "second" : "seconds"}.
        </p>
      ) : null}
      <p className="sr-only" role="status" aria-live="polite" data-testid="cooldown-announcement">
        {announcement}
      </p>
    </>
  );
}
