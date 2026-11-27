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
    if (active === null || active === document.body) ref.current?.focus();
  }, []);
  return { ref, focus };
}
