"use client";

import * as React from "react";
import { FormMessage } from "@/components/ui/form-message";
import { takeFlash } from "@/lib/households/flash";
import { useUserId } from "@/components/layout/app-shell-client";

/**
 * Shows the one-time message set before a navigation ("You left The Lee family."). It is read once
 * from this tab's sessionStorage after the page has mounted.
 */
export function FlashMessage() {
  const userId = useUserId();
  const [message, setMessage] = React.useState<string | null>(null);
  React.useEffect(() => {
    const flash = takeFlash(userId);
    // eslint-disable-next-line react-hooks/set-state-in-effect -- sessionStorage only exists in the browser, so the first render cannot read it
    if (flash) setMessage(flash);
  }, [userId]);
  return (
    <div className={message ? "mb-4" : undefined}>
      <FormMessage kind="success" id="flash-message">
        {message}
      </FormMessage>
    </div>
  );
}
