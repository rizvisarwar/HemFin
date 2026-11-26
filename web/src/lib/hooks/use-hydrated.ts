"use client";

import * as React from "react";

const noopSubscribe = () => () => {};

/**
 * False in the server HTML and during hydration, true once the component has mounted in the
 * browser. Submit buttons and action buttons stay disabled until then, so a form can never be
 * submitted (and a click never lost) before its JavaScript is attached.
 */
export function useHydrated(): boolean {
  return React.useSyncExternalStore(noopSubscribe, () => true, () => false);
}
