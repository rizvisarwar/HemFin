"use client";

import * as React from "react";
import { useUserId } from "@/components/layout/app-shell-client";
import { useToast } from "@/components/ui/toast";
import { takeFlash } from "@/lib/households/flash";

/**
 * Shows the one-time message set before a navigation as a toast ("You joined The Lee family." after
 * accepting an invitation). It is read once from this tab's sessionStorage, keyed by the signed-in user.
 */
export function FlashToast() {
  const userId = useUserId();
  const toast = useToast();
  React.useEffect(() => {
    const message = takeFlash(userId);
    if (message) toast(message);
  }, [userId, toast]);
  return null;
}
