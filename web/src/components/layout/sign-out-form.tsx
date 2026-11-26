"use client";

import * as React from "react";
import { signOut } from "@/app/auth/actions";
import { clearHemfinSession } from "@/lib/households/flash";

/**
 * The one sign-out form. The server action ends the session and deletes the space cookie; this
 * also wipes the household names and one-time messages kept for this tab, so every sign-out path
 * (top bar, "could not load your account" screen) clears the same things.
 */
export function SignOutForm({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <form action={signOut} onSubmit={() => clearHemfinSession()} className={className}>
      {children}
    </form>
  );
}
