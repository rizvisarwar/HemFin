"use client";

import * as React from "react";
import { createClient } from "@/lib/supabase/client";
import { mapAuthError } from "@/lib/auth/errors";
import { sanitizeNext } from "@/lib/auth/next-path";

/**
 * "Continue with Google" button following Google's branding guidelines: the unmodified
 * four-colour "G" mark on a plain light (or dark) surface with a neutral stroke, Roboto-style
 * medium label text, 12 px between mark and label, and the exact label wording.
 * Colours: light #FFFFFF / #747775 stroke / #1F1F1F text; dark #131314 / #8E918F / #E3E3E3.
 */
export function GoogleButton({
  next,
  onError,
}: {
  next?: string | null;
  onError: (message: string) => void;
}) {
  const [busy, setBusy] = React.useState(false);

  async function onClick() {
    setBusy(true);
    try {
      const supabase = createClient();
      const target = sanitizeNext(next);
      const { error } = await supabase.auth.signInWithOAuth({
        provider: "google",
        options: { redirectTo: `${window.location.origin}/auth/callback?next=${encodeURIComponent(target)}` },
      });
      if (error) {
        onError(mapAuthError(error, "oauth").message);
        setBusy(false);
      }
      // On success the browser is navigating to Google.
    } catch {
      onError(mapAuthError({ message: "network" }, "oauth").message);
      setBusy(false);
    }
  }

  return (
    <button
      type="button"
      onClick={onClick}
      disabled={busy}
      aria-busy={busy || undefined}
      data-testid="google-button"
      className="inline-flex h-11 w-full items-center justify-center gap-3 rounded-full border border-[#747775] bg-white px-3 text-[14px] leading-5 font-medium text-[#1F1F1F] transition-colors outline-none hover:bg-[#F2F2F2] focus-visible:ring-3 focus-visible:ring-ring/50 disabled:opacity-60 dark:border-[#8E918F] dark:bg-[#131314] dark:text-[#E3E3E3] dark:hover:bg-[#1f2022]"
    >
      <svg aria-hidden="true" viewBox="0 0 48 48" className="size-[18px] shrink-0">
        <path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z" />
        <path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z" />
        <path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z" />
        <path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z" />
      </svg>
      <span>Continue with Google</span>
    </button>
  );
}

export function OrDivider() {
  return (
    <div className="flex items-center gap-3" aria-hidden="true">
      <span className="h-px flex-1 bg-border" />
      <span className="text-small text-muted-foreground">or</span>
      <span className="h-px flex-1 bg-border" />
    </div>
  );
}
