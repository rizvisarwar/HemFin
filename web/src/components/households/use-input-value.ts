"use client";

import * as React from "react";

/**
 * The current value of the (uncontrolled) input with this id, kept in step as the user types.
 *
 * The input is not controlled by React, so text typed before hydration survives it. The value is
 * read through useSyncExternalStore, which re-reads it once on mount (so earlier text counts) and
 * after every `input` event. It is "" in the server HTML.
 */
export function useInputValue(inputId: string): string {
  return React.useSyncExternalStore(
    React.useCallback((onChange) => {
      document.addEventListener("input", onChange);
      return () => document.removeEventListener("input", onChange);
    }, []),
    () => (document.getElementById(inputId) as HTMLInputElement | null)?.value ?? "",
    () => "",
  );
}
