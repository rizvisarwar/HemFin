"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { CircleCheck } from "lucide-react";
import { setActiveSpace } from "@/app/actions";
import { signOutInPlace } from "@/app/auth/actions";
import { AuthLayout } from "@/components/layout/auth-layout";
import { Button, buttonVariants } from "@/components/ui/button";
import { HemCard } from "@/components/ui/hem-card";
import { ResponsiveDialog } from "@/components/ui/responsive-dialog";
import { Skeleton } from "@/components/ui/skeleton";
import { createBrowserApi, type InvitationPreview } from "@/lib/api";
import { clearHemfinSession, setFlash } from "@/lib/households/flash";
import { useHydrated } from "@/lib/hooks/use-hydrated";
import { clearJoined, getJoined, setJoined, type JoinedMarker } from "@/lib/invitations/joined";
import {
  captureTokenFromLocation,
  clearStoredToken,
  INVITE_TOKEN_KEY,
} from "@/lib/invitations/token";
import { createClient } from "@/lib/supabase/client";

/** Sign-in and sign-up carry only this path. The token stays in sessionStorage, never in `next`. */
const SIGN_IN = `/sign-in?next=${encodeURIComponent("/invite")}`;
const SIGN_UP = `/sign-up?next=${encodeURIComponent("/invite")}`;
const SESSION_ENDED = `/sign-in?next=${encodeURIComponent("/invite")}&reason=session`;

const LINK =
  "inline-flex min-h-11 items-center font-medium text-primary underline-offset-4 hover:underline disabled:opacity-60";

/**
 * The API rejected the session (J): end it here too, so the sign-in page is reachable (the proxy would
 * send a still-valid cookie to the dashboard), keep the invitation token, and go to sign-in with a notice.
 */
async function sessionEnded(replace: (href: string) => void): Promise<void> {
  clearHemfinSession([INVITE_TOKEN_KEY]);
  try {
    await signOutInPlace();
  } catch {
    // the sign-in page shows either way
  }
  try {
    await createClient().auth.signOut({ scope: "local" });
  } catch {
    // ignore
  }
  replace(SESSION_ENDED);
}

/** A real link (role link) that looks like a full-width large button. */
const linkButton = (variant: "default" | "outline" = "default") =>
  buttonVariants({ size: "lg", variant, className: "w-full" });

type View =
  /** A: reading the fragment and asking who is signed in. */
  | { k: "checking" }
  /** B: signed out, token held. The preview is not called until sign-in. */
  | { k: "signed-out" }
  /** C: signed in, preview loaded. */
  | { k: "ready"; preview: InvitationPreview; userId: string; email: string | null }
  /** F: shown from the tab marker only. */
  | { k: "joined"; marker: JoinedMarker; userId: string }
  /** G */
  | { k: "declined"; household: string }
  /** H: one generic state for every invitee-side failure, so nothing says which check failed. */
  | { k: "generic"; signedIn: boolean }
  /** I: not about the invitation (network or server). */
  | { k: "unreachable"; server: boolean };

type Outcome = "ok" | "auth" | "generic" | "server";

/** One mapping for preview, accept and decline: every 4xx except 401 is the generic state (the API answers 404 for all of them). */
function classify(status: number): Outcome {
  if (status >= 200 && status < 300) return "ok";
  if (status === 401) return "auth";
  if (status === 429 || status >= 500) return "server";
  return "generic";
}

const reassurance = "Only you can see personal records. Household members see only what the household shares.";

/**
 * The accept page (docs/design/households.md 6.8). The token comes from the URL fragment only, is
 * moved into sessionStorage and cleared from the address bar on mount (lib/invitations/token.ts), and
 * is sent only in the JSON body of the preview, accept and decline calls. Every invitee-side failure
 * shows the one generic state, so the page never reveals whether the signed-in address matched.
 */
export function InviteFlow() {
  const router = useRouter();
  const hydrated = useHydrated();
  const [view, setView] = React.useState<View>({ k: "checking" });
  const [busy, setBusy] = React.useState<"accept" | "decline" | "signout" | null>(null);
  const [declineOpen, setDeclineOpen] = React.useState(false);
  const [run, setRun] = React.useState(0);
  const heading = React.useRef<HTMLHeadingElement>(null);
  const cancel = React.useRef<HTMLButtonElement>(null);
  const previous = React.useRef<View["k"]>("checking");

  // Read the fragment, move the token to sessionStorage, then work out the state. `run` restarts it.
  React.useEffect(() => {
    let cancelled = false;
    const set = (next: View) => {
      if (!cancelled) setView(next);
    };
    (async () => {
      const token = captureTokenFromLocation();
      let user: { id: string; email: string | null } | null = null;
      try {
        // Reads the stored session; the API verifies the token on every call below.
        const { data } = await createClient().auth.getSession();
        if (data.session) user = { id: data.session.user.id, email: data.session.user.email ?? null };
      } catch {
        user = null; // no Supabase configuration or storage: treat as signed out
      }
      if (!token) {
        // A reload after a successful accept: the API would say 404 for the used token, so use the marker (6.8 K).
        const marker = user ? getJoined(user.id) : null;
        set(user && marker ? { k: "joined", marker, userId: user.id } : { k: "generic", signedIn: user !== null });
        return;
      }
      if (!user) {
        set({ k: "signed-out" });
        return;
      }
      try {
        const api = await createBrowserApi();
        const { data, response } = await api.POST("/api/v1/invitations/preview", { body: { token } });
        const outcome = classify(response.status);
        if (outcome === "ok" && data) set({ k: "ready", preview: data, userId: user.id, email: user.email });
        else if (outcome === "auth") await sessionEnded(router.replace);
        else if (outcome === "server") set({ k: "unreachable", server: true });
        else set({ k: "generic", signedIn: true });
      } catch {
        set({ k: "unreachable", server: false });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [run, router]);

  // Another invitation link opened in this tab changes only the fragment, so the page is not reloaded:
  // take the new token the same way.
  React.useEffect(() => {
    const onHashChange = () => {
      setView({ k: "checking" });
      setRun((n) => n + 1);
    };
    window.addEventListener("hashchange", onHashChange);
    return () => window.removeEventListener("hashchange", onHashChange);
  }, []);

  // Focus follows a change of state (6.8), but not the first arrival: on load focus stays on the page.
  React.useEffect(() => {
    const from = previous.current;
    previous.current = view.k;
    if (from !== "checking" && from !== view.k) heading.current?.focus();
  }, [view.k]);

  async function accept() {
    if (view.k !== "ready" || busy) return;
    const { userId } = view;
    const token = captureTokenFromLocation();
    if (!token) {
      setView({ k: "generic", signedIn: true });
      return;
    }
    setBusy("accept");
    try {
      const api = await createBrowserApi();
      const { data, response } = await api.POST("/api/v1/invitations/accept", { body: { token } });
      const outcome = classify(response.status);
      if (outcome === "ok" && data) {
        // 6.8 K: clear the token at once, keep a token-free marker for this tab, select the household,
        // leave a one-time message for the next page, and replace this history entry.
        clearStoredToken();
        setJoined(userId, { spaceId: data.space_id, name: data.household_name });
        setFlash(userId, `You joined ${data.household_name}.`);
        await setActiveSpace(data.space_id).catch(() => false);
        router.replace(`/household/${data.space_id}/members`);
        return; // stays busy while the next page loads
      }
      if (outcome === "auth") await sessionEnded(router.replace);
      else if (outcome === "server") setView({ k: "unreachable", server: true });
      else setView({ k: "generic", signedIn: true });
    } catch {
      setView({ k: "unreachable", server: false });
    }
    setBusy(null);
  }

  async function decline() {
    if (view.k !== "ready" || busy) return;
    const token = captureTokenFromLocation();
    const household = view.preview.household_name;
    if (!token) {
      setDeclineOpen(false);
      setView({ k: "generic", signedIn: true });
      return;
    }
    setBusy("decline");
    try {
      const api = await createBrowserApi();
      const { response } = await api.POST("/api/v1/invitations/decline", { body: { token } });
      const outcome = classify(response.status);
      setDeclineOpen(false);
      if (outcome === "ok") {
        clearStoredToken();
        setView({ k: "declined", household });
      } else if (outcome === "auth") await sessionEnded(router.replace);
      else if (outcome === "server") setView({ k: "unreachable", server: true });
      else setView({ k: "generic", signedIn: true });
    } catch {
      setDeclineOpen(false);
      setView({ k: "unreachable", server: false });
    }
    setBusy(null);
  }

  /**
   * "Sign out" on this page: ends the session, wipes this tab's HemFin state (including the joined
   * marker) and stays here, so the invitee can sign in with the address the invitation was sent to.
   * It is the one sign-out that keeps the invitation token (an unusable token is harmless to anyone
   * else: only the address it was sent to can accept it).
   */
  async function signOutHere(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (busy) return;
    setBusy("signout");
    clearHemfinSession([INVITE_TOKEN_KEY]);
    try {
      await signOutInPlace();
    } catch {
      // the next check treats an unreachable server like a missing session
    }
    try {
      await createClient().auth.signOut({ scope: "local" });
    } catch {
      // ignore
    }
    setBusy(null);
    setView({ k: "checking" });
    setRun((n) => n + 1);
  }

  const signOutForm = (label: React.ReactNode, className: string) => (
    <form method="post" onSubmit={signOutHere}>
      <button type="submit" disabled={!hydrated || busy !== null} className={className} data-testid="invite-sign-out">
        {label}
      </button>
    </form>
  );

  // ---- A: checking ----
  if (view.k === "checking") {
    return (
      <AuthLayout brandPanel={false} title="Checking your invitation" titleRef={heading}>
        <div aria-busy="true" data-testid="invite-checking">
          <p className="sr-only" role="status">
            Checking your invitation
          </p>
          <Skeleton className="h-5 w-3/4" />
          <Skeleton className="mt-3 h-5 w-1/2" />
        </div>
      </AuthLayout>
    );
  }

  // ---- B: signed out ----
  if (view.k === "signed-out") {
    return (
      <AuthLayout
        brandPanel={false}
        title="Join a household"
        titleRef={heading}
        description="You have a household invitation. Sign in or create an account to see it. Only the address it was sent to can accept it."
      >
        <div className="space-y-4" data-testid="invite-signed-out">
          <HemCard variant="muted" padding="none" className="p-3">
            <p className="text-small text-muted-foreground">{reassurance}</p>
          </HemCard>
          <Link href={SIGN_IN} className={linkButton()}>
            Sign in
          </Link>
          <Link href={SIGN_UP} className={linkButton("outline")}>
            Create an account
          </Link>
        </div>
      </AuthLayout>
    );
  }

  // ---- C / E: signed in, preview loaded ----
  if (view.k === "ready") {
    const { preview, email } = view;
    const inviter = preview.inviter_name?.trim();
    const accepting = busy === "accept";
    return (
      <AuthLayout
        brandPanel={false}
        title={`Join ${preview.household_name}`}
        titleRef={heading}
        description={`${inviter ? `${inviter} invited you.` : "Someone in the household invited you."} Once you join, you see what the household shares. Your personal records stay private.`}
      >
        <div className="space-y-4" aria-busy={accepting || undefined} data-testid="invite-ready">
          <div className="flex flex-col gap-3">
            <Button
              size="lg"
              className="w-full"
              onClick={accept}
              disabled={!hydrated || busy === "decline"}
              aria-disabled={accepting || undefined}
              aria-busy={accepting || undefined}
              data-testid="invite-accept"
            >
              {accepting ? "Joining…" : "Accept invitation"}
            </Button>
            <Button
              size="lg"
              variant="outline"
              className="w-full"
              onClick={() => setDeclineOpen(true)}
              disabled={!hydrated || busy !== null}
              data-testid="invite-decline"
            >
              Decline
            </Button>
          </div>
          <div className="text-small text-muted-foreground">
            <p className="[overflow-wrap:anywhere]" data-testid="invite-signed-in-as">
              {email ? `Signed in as ${email}.` : "You are signed in."}
            </p>
            <div className="flex items-center gap-1">
              <span>Not you?</span>
              {signOutForm("Sign out", LINK)}
            </div>
          </div>
        </div>
        <ResponsiveDialog
          alert
          open={declineOpen}
          onOpenChange={setDeclineOpen}
          busy={busy === "decline"}
          title="Decline this invitation?"
          description={`${preview.household_name} will not be joined. ${inviter ?? "Someone in the household"} can send another invitation.`}
          initialFocus={cancel}
          footer={
            <>
              <Button
                type="button"
                variant="destructive"
                onClick={decline}
                disabled={busy === "decline"}
                aria-busy={busy === "decline" || undefined}
                data-testid="invite-confirm-decline"
              >
                {busy === "decline" ? "Declining…" : "Decline invitation"}
              </Button>
              <Button ref={cancel} type="button" variant="outline" onClick={() => setDeclineOpen(false)} disabled={busy === "decline"}>
                Cancel
              </Button>
            </>
          }
        />
      </AuthLayout>
    );
  }

  // ---- F: joined (from the marker) ----
  if (view.k === "joined") {
    const { marker, userId } = view;
    // Leaving the accept flow removes the marker (6.8 K, point 4).
    const done = () => clearJoined(userId);
    return (
      <AuthLayout
        brandPanel={false}
        title={`You joined ${marker.name}`}
        titleRef={heading}
        titleIcon={<CircleCheck aria-hidden="true" className="mt-1 size-6 shrink-0 text-success" />}
        description={`${marker.name} is now your selected space.`}
      >
        <p className="sr-only" role="status">
          You joined {marker.name}.
        </p>
        <div className="flex flex-col gap-3" data-testid="invite-joined">
          <Link href="/dashboard" onClick={done} className={linkButton()}>
            Go to dashboard
          </Link>
          <Link href={`/household/${marker.spaceId}/members`} onClick={done} className={linkButton("outline")}>
            View members
          </Link>
        </div>
      </AuthLayout>
    );
  }

  // ---- G: declined ----
  if (view.k === "declined") {
    return (
      <AuthLayout brandPanel={false} title="Invitation declined" titleRef={heading} description={`You did not join ${view.household}.`}>
        <p className="sr-only" role="status">
          Invitation declined.
        </p>
        <Link href="/dashboard" className={linkButton()} data-testid="invite-declined">
          Go to dashboard
        </Link>
      </AuthLayout>
    );
  }

  // ---- I: could not reach HemFin ----
  if (view.k === "unreachable") {
    return (
      <AuthLayout
        brandPanel={false}
        title="We could not check your invitation"
        titleRef={heading}
        description={
          view.server
            ? "HemFin is having trouble right now. Try again in a few minutes."
            : "We could not reach HemFin. Check your connection and try again."
        }
      >
        <p className="sr-only" role="alert">
          We could not check your invitation.
        </p>
        <Button
          size="lg"
          className="w-full"
          onClick={() => {
            setView({ k: "checking" });
            setRun((n) => n + 1);
          }}
          disabled={!hydrated}
          data-testid="invite-retry"
        >
          Try again
        </Button>
      </AuthLayout>
    );
  }

  // ---- H: cannot be used (generic, D7) ----
  return (
    <AuthLayout
      brandPanel={false}
      title="This invitation can't be used"
      titleRef={heading}
      description="This invitation link is no longer valid. Ask the person who invited you to send a new one."
    >
      <p className="sr-only" role="alert">
        This invitation can&apos;t be used.
      </p>
      <div className="space-y-4" data-testid="invite-generic">
        {/* Shown for every failure, so it says nothing about this one. */}
        <p className="text-body">
          {view.signedIn
            ? "If you were invited at a different email address, sign out, then sign in with that address."
            : "If you were invited at a different email address, sign in with that address."}
        </p>
        {view.signedIn ? (
          <div className="flex flex-col gap-3">
            <form method="post" onSubmit={signOutHere}>
              <Button type="submit" size="lg" variant="outline" className="w-full" disabled={!hydrated || busy !== null} data-testid="invite-sign-out">
                Sign out
              </Button>
            </form>
            <Link href="/dashboard" className={linkButton()}>
              Go to dashboard
            </Link>
          </div>
        ) : (
          <Link href={SIGN_IN} className={linkButton()}>
            Sign in
          </Link>
        )}
      </div>
    </AuthLayout>
  );
}
