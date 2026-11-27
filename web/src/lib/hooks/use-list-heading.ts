"use client";

import * as React from "react";

/**
 * The list heading that takes focus after a delete (finance.md 3.11): the row the user came from is
 * gone. `focus()` only moves focus when nothing else has it (the page body), so it never steals focus
 * from a control the user has already moved to.
 */
export function useListHeading() {
  const ref = React.useRef<HTMLHeadingElement>(null);
  const focus = React.useCallback(() => {
    const active = document.activeElement;
    // An element that is no longer on screen does not count as focus: after a client-side navigation the
    // previous page can stay mounted but hidden, and WebKit may still report its button as active.
    const nothing = active === null || active === document.body || active.getClientRects().length === 0;
    if (nothing) ref.current?.focus();
  }, []);
  return { ref, focus };
}
