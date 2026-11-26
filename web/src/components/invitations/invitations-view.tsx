"use client";

import * as React from "react";
import { Mail } from "lucide-react";
import { useCooldown } from "@/components/auth/cooldown";
import { Field, useFocusFirstInvalid } from "@/components/auth/form-parts";
import { useFormat } from "@/components/format-provider";
import { ROLE_COPY } from "@/components/households/member-dialogs";
import { Button } from "@/components/ui/button";
import { DataTable } from "@/components/ui/data-table";
import { EmptyState } from "@/components/ui/empty-state";
import { FormMessage } from "@/components/ui/form-message";
import { HemCard } from "@/components/ui/hem-card";
import { ResponsiveDialog } from "@/components/ui/responsive-dialog";
import { ResponsiveList } from "@/components/ui/responsive-list";
import { Skeleton } from "@/components/ui/skeleton";
import { StatusChip } from "@/components/ui/status-chip";
import { createBrowserApi, type InvitationResponse } from "@/lib/api";
import { useHydrated } from "@/lib/hooks/use-hydrated";
import { ROLE_LABEL } from "@/lib/households/households";
import {
  dateLabel,
  displayStatus,
  isActionable,
  mergeInvitations,
  nowMs,
  parseRetryAfter,
  problemCode,
  resendLimit,
  validateInviteEmail,
  waitLabel,
  type ResendLimit,
} from "@/lib/invitations/invitations";
import { NETWORK_MESSAGE, parseProblem } from "@/lib/profile/problem";

const PAGE_SIZE = 20;

const COPY = {
  notSent: "We saved the invitation but couldn't send the email. Try Resend in a moment.",
  unavailable: "Invitations are not available right now. Try again later.",
  forbidden: "You no longer have permission to invite people.",
  alreadyMember: "This person is already a member of the household.",
  alreadyInvited: "There is already a pending invitation for this address. Resend it or revoke it below.",
  gone: "That invitation is no longer pending.",
  listFailed: "We could not load invitations just now.",
  moreFailed: "We could not load more invitations. Try again.",
  actionFailed: "We could not do that. Refresh the page and try again.",
} as const;

type Kind = "success" | "error" | "info";
interface Notice {
  kind: Kind;
  text: string;
}
interface RowState {
  busy?: "resend" | "revoke";
  message?: Notice;
  /** Set by a 429: when it arrived and what the wait is. */
  limit?: { at: number; limit: ResendLimit };
}

/** The message for a refused invitation call. Never includes anything the user typed beyond what the API echoes. */
function refusal(status: number, error: unknown): Notice {
  const code = problemCode(error);
  if (code === "email_not_sent") return { kind: "info", text: COPY.notSent };
  if (status === 503) return { kind: "error", text: COPY.unavailable };
  if (status === 403) return { kind: "error", text: COPY.forbidden };
  if (status === 409) return { kind: "error", text: COPY.gone };
  if (status === 401) return { kind: "error", text: parseProblem(401, error).form ?? COPY.actionFailed };
  return { kind: "error", text: COPY.actionFailed };
}

/**
 * Invitations for one household (docs/design/households.md 6.4, 6.6): the invite form, the list
 * with resend and revoke, and "Show more". The list is a `DataTable` from md up and a
 * `ResponsiveList` on phones. Only owners and admins reach this page (the page redirects others),
 * and the API stays the authority: a refusal shows its message.
 */
export function InvitationsView({ spaceId }: { spaceId: string }) {
  const hydrated = useHydrated(); // buttons stay disabled until their click handlers exist
  const { date } = useFormat();
  const form = React.useRef<HTMLFormElement>(null);
  const emailInput = React.useRef<HTMLInputElement>(null);
  const heading = React.useRef<HTMLHeadingElement>(null);
  const pressing = React.useRef(false);
  const alive = React.useRef(true);

  const [items, setItems] = React.useState<InvitationResponse[]>([]);
  const [cursor, setCursor] = React.useState<string | null>(null);
  const [load, setLoad] = React.useState<"loading" | "ready" | "error">("loading");
  const [loadingMore, setLoadingMore] = React.useState(false);
  const [moreError, setMoreError] = React.useState(false);
  // The clock at the last load, so expiry is judged without reading the time while rendering.
  const [loadedAt, setLoadedAt] = React.useState(0);

  const [emailError, setEmailError] = React.useState<string>();
  const [notice, setNotice] = React.useState<Notice | null>(null);
  const [sending, setSending] = React.useState(false);
  const [attempt, setAttempt] = React.useState(0);
  useFocusFirstInvalid(form, attempt);

  const [rows, setRows] = React.useState<Record<string, RowState>>({});
  const [listNotice, setListNotice] = React.useState<string | null>(null);
  const [revoking, setRevoking] = React.useState<{ inv: InvitationResponse; open: boolean; key: number } | null>(null);
  const revokeOpener = React.useRef<HTMLElement | null>(null);
  const revoked = React.useRef(false);
  const seq = React.useRef(0);

  React.useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);

  const setRow = React.useCallback((id: string, patch: RowState | null) => {
    setRows((all) => {
      const next = { ...all };
      if (patch === null) delete next[id];
      else next[id] = patch;
      return next;
    });
  }, []);

  /** Reads the first page (replacing the list). Used on mount, Retry, and after a change the page cannot predict. */
  const reload = React.useCallback(async () => {
    setLoad((s) => (s === "ready" ? s : "loading"));
    try {
      const api = await createBrowserApi();
      const { data, response } = await api.GET("/api/v1/spaces/{space_id}/invitations", {
        params: { path: { space_id: spaceId }, query: { limit: PAGE_SIZE } },
        cache: "no-store",
      });
      if (!alive.current) return;
      if (response.ok && data) {
        setItems(data.items);
        setCursor(data.next_cursor ?? null);
        setMoreError(false);
        setLoadedAt(nowMs());
        setLoad("ready");
      } else setLoad((s) => (s === "ready" ? s : "error"));
    } catch {
      if (alive.current) setLoad((s) => (s === "ready" ? s : "error"));
    }
  }, [spaceId]);

  React.useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- the first read happens in the browser after the form is on screen
    void reload();
  }, [reload]);

  async function showMore() {
    if (!cursor || loadingMore) return;
    setLoadingMore(true);
    setMoreError(false);
    try {
      const api = await createBrowserApi();
      const { data, response } = await api.GET("/api/v1/spaces/{space_id}/invitations", {
        params: { path: { space_id: spaceId }, query: { limit: PAGE_SIZE, cursor } },
        cache: "no-store",
      });
      if (response.ok && data) {
        setItems((all) => mergeInvitations(all, data.items));
        setCursor(data.next_cursor ?? null);
        setLoadedAt(nowMs());
      } else setMoreError(true);
    } catch {
      setMoreError(true);
    }
    setLoadingMore(false);
  }

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (sending) return;
    const data = new FormData(e.currentTarget);
    const email = String(data.get("invite-email") ?? "").trim();
    const role = data.get("role") === "admin" ? "admin" : "member";
    const invalid = validateInviteEmail(email);
    setNotice(null);
    if (invalid) {
      setEmailError(invalid);
      setAttempt((n) => n + 1);
      return;
    }
    setEmailError(undefined);
    setSending(true);
    try {
      const api = await createBrowserApi();
      const {
        data: created,
        error,
        response,
      } = await api.POST("/api/v1/spaces/{space_id}/invitations", {
        params: { path: { space_id: spaceId } },
        body: { email, role },
      });
      if (response.ok && created) {
        form.current?.reset();
        setItems((all) => mergeInvitations([created], all));
        setLoadedAt(nowMs());
        setNotice({ kind: "success", text: `Invitation sent to ${created.email}. The link works for 7 days.` });
      } else if (response.status === 409 && problemCode(error) === "already_member") {
        setEmailError(COPY.alreadyMember);
        setAttempt((n) => n + 1);
      } else if (response.status === 409 && problemCode(error) === "already_invited") {
        setEmailError(COPY.alreadyInvited);
        setAttempt((n) => n + 1);
      } else if (response.status === 422) {
        setEmailError(validateInviteEmail(email) ?? "Enter an email address like name@example.com.");
        setAttempt((n) => n + 1);
      } else {
        const message = refusal(response.status, error);
        setNotice(message);
        if (problemCode(error) === "email_not_sent") {
          // The invitation was saved even though the email was not: show its row, with Resend.
          form.current?.reset();
          void reload();
        }
      }
    } catch {
      setNotice({ kind: "error", text: NETWORK_MESSAGE });
    }
    if (alive.current) setSending(false);
  }

  async function resend(inv: InvitationResponse) {
    if (rows[inv.id]?.busy) return;
    setRow(inv.id, { busy: "resend" });
    try {
      const api = await createBrowserApi();
      const { data, error, response } = await api.POST("/api/v1/spaces/{space_id}/invitations/{invitation_id}/resend", {
        params: { path: { space_id: spaceId, invitation_id: inv.id } },
      });
      if (response.ok && data) {
        setItems((all) => all.map((i) => (i.id === data.id ? data : i)));
        setLoadedAt(nowMs());
        setRow(inv.id, { message: { kind: "success", text: "Invitation resent. The old link no longer works." } });
      } else if (response.status === 429) {
        const wait = resendLimit(parseRetryAfter(response.headers.get("Retry-After")));
        setRow(inv.id, {
          limit: { at: nowMs(), limit: wait },
          message: wait.kind === "text" ? { kind: "error", text: wait.text } : undefined,
        });
      } else {
        setRow(inv.id, { message: refusal(response.status, error) });
        // Gone or not found: the list is out of date. email_not_sent: the row's dates changed.
        if (response.status === 409 || response.status === 404 || problemCode(error) === "email_not_sent") void reload();
      }
    } catch {
      setRow(inv.id, { message: { kind: "error", text: NETWORK_MESSAGE } });
    }
  }

  function openRevoke(inv: InvitationResponse) {
    revokeOpener.current = document.activeElement as HTMLElement | null;
    revoked.current = false;
    setListNotice(null);
    setRevoking({ inv, open: true, key: ++seq.current });
  }
  const closeRevoke = () => setRevoking((r) => (r ? { ...r, open: false } : r));

  function onRevoked(inv: InvitationResponse) {
    revoked.current = true;
    setItems((all) =>
      all.map((i) => (i.id === inv.id ? { ...i, status: "revoked", responded_at: new Date(nowMs()).toISOString() } : i)),
    );
    setLoadedAt(nowMs());
    setRow(inv.id, null);
    setListNotice("Invitation revoked.");
    closeRevoke();
  }

  // Focus: after a revoke the row's buttons are gone, so go to the list heading (6.4).
  const revokeFinalFocus = () =>
    revoked.current ? heading.current : revokeOpener.current?.isConnected ? revokeOpener.current : heading.current;

  const statusOf = (inv: InvitationResponse) => displayStatus(inv, loadedAt);

  function actions(inv: InvitationResponse) {
    const status = statusOf(inv);
    if (!isActionable(status)) return null;
    return (
      <RowActions
        inv={inv}
        state={rows[inv.id]}
        enabled={hydrated}
        onResend={() => resend(inv)}
        onRevoke={() => openRevoke(inv)}
        onLimitEnd={() => setRow(inv.id, null)}
      />
    );
  }

  const message = (inv: InvitationResponse) => {
    const state = rows[inv.id];
    return state?.message || state?.limit ? <RowMessage state={state} /> : null;
  };

  return (
    <div className="md:max-w-[640px] xl:grid xl:max-w-none xl:grid-cols-[22rem_minmax(0,1fr)] xl:items-start xl:gap-6" data-testid="invitations">
      <HemCard className="xl:sticky xl:top-24">
        <h2 className="text-h2">Invite someone</h2>
        <p className="mt-1 text-body text-muted-foreground">
          They get an email with a link. It works only for the address you enter and expires after 7 days.
        </p>
        {/* method="post": if the form is ever submitted without JavaScript, nothing goes into the URL. */}
        <form ref={form} method="post" noValidate onSubmit={onSubmit} aria-busy={sending || undefined} className="mt-4 space-y-4" data-testid="invite-form">
          <FormMessage kind={notice?.kind ?? "info"} id="invite-notice">
            {notice?.text}
          </FormMessage>
          {/* The error line keeps its height whether or not a message shows, so a blur message never moves
              the Send button out from under a tap (Safari blurs on tap). */}
          <div className="[&_#invite-email-error]:min-h-5">
            <Field
              id="invite-email"
              label="Email address"
              type="email"
              inputMode="email"
              autoComplete="off"
              autoCapitalize="none"
              spellCheck={false}
              enterKeyHint="send"
              placeholder="name@example.com"
              hint="They need to use this address to accept."
              error={emailError}
              ref={emailInput}
              // A press on Send blurs the field first, and Safari gives no relatedTarget: the press is recorded on pointerdown.
              onFocus={() => (pressing.current = false)}
              onBlur={(e) => {
                if (pressing.current) return;
                setEmailError(validateInviteEmail(e.currentTarget.value) ?? undefined);
              }}
              onInput={(e) => emailError && setEmailError(validateInviteEmail(e.currentTarget.value) ?? undefined)}
            />
          </div>
          <fieldset className="space-y-1">
            <legend className="mb-1 text-body font-medium">Role</legend>
            {(["member", "admin"] as const).map((value) => (
              <label key={value} className="flex min-h-11 cursor-pointer items-start gap-3 rounded-md py-2">
                <input
                  type="radio"
                  name="role"
                  value={value}
                  defaultChecked={value === "member"}
                  aria-describedby={`invite-role-help-${value}`}
                  className="mt-0.5 size-5 shrink-0 accent-primary"
                />
                <span className="min-w-0">
                  <span className="block text-body-strong">{ROLE_COPY[value].label}</span>
                  <span id={`invite-role-help-${value}`} className="block text-small text-muted-foreground">
                    {ROLE_COPY[value].help}
                  </span>
                </span>
              </label>
            ))}
          </fieldset>
          <Button
            type="submit"
            className="w-full"
            disabled={!hydrated}
            aria-disabled={sending || undefined}
            aria-busy={sending || undefined}
            onPointerDown={() => (pressing.current = true)}
            onClick={() => (pressing.current = false)}
            data-testid="send-invitation"
          >
            {sending ? "Sending…" : "Send invitation"}
          </Button>
        </form>
      </HemCard>

      <section aria-labelledby="invitations-heading" className="mt-6 xl:mt-0" aria-busy={load === "loading" || undefined}>
        <h2 id="invitations-heading" ref={heading} tabIndex={-1} className="text-h2 outline-none">
          Invitations
        </h2>
        <div className={listNotice ? "mt-3" : undefined}>
          <FormMessage kind="success" id="invitations-list-notice">
            {listNotice}
          </FormMessage>
        </div>

        {load === "loading" ? (
          <div className="mt-4" data-testid="invitations-loading">
            <p className="sr-only" role="status">
              Loading invitations
            </p>
            <div className="space-y-3 md:hidden">
              {[0, 1, 2].map((i) => (
                <Skeleton key={i} className="h-32 w-full" />
              ))}
            </div>
            <div className="hidden space-y-2 md:block">
              {[0, 1, 2].map((i) => (
                <Skeleton key={i} className="h-16 w-full" />
              ))}
            </div>
          </div>
        ) : null}

        {load === "error" ? (
          <div className="mt-4 space-y-3" data-testid="invitations-error">
            <FormMessage kind="error">{COPY.listFailed}</FormMessage>
            <Button type="button" variant="outline" onClick={() => void reload()} disabled={!hydrated}>
              Retry
            </Button>
          </div>
        ) : null}

        {load === "ready" && items.length === 0 ? (
          <HemCard className="mt-4" data-testid="invitations-empty">
            <EmptyState
              variant="inline"
              icon={Mail}
              titleAs="h3"
              title="No invitations yet"
              description="Invite a partner or family member by email. They see only what you share."
              primaryAction={{ label: "Invite someone", onClick: () => emailInput.current?.focus() }}
            />
          </HemCard>
        ) : null}

        {load === "ready" && items.length > 0 ? (
          <>
            <ResponsiveList
              className="mt-4"
              label="Invitations"
              rows={items}
              getRowKey={(inv) => inv.id}
              cardTestId="invitation-card"
              renderCard={(inv) => {
                const status = statusOf(inv);
                const acts = actions(inv);
                const note = message(inv);
                return (
                  <>
                    <p className="text-body-strong [overflow-wrap:anywhere]" data-testid="invitation-email">
                      {inv.email}
                    </p>
                    <p className="mt-0.5 text-small text-muted-foreground">
                      {ROLE_LABEL[inv.role]} · {dateLabel(inv, status, date)}
                    </p>
                    <div className="mt-2">
                      <StatusChip status={status} />
                    </div>
                    {note ? <div className="mt-3">{note}</div> : null}
                    {acts ? <div className="mt-3 flex gap-2 [&>*]:flex-1">{acts}</div> : null}
                  </>
                );
              }}
            />
            <DataTable
              className="mt-4"
              label="Invitations"
              rows={items}
              getRowKey={(inv) => inv.id}
              rowTestId="invitation-row"
              rowFooter={(inv) => message(inv)}
              columns={[
                {
                  id: "email",
                  header: "Email",
                  cell: (inv) => (
                    <div className="min-w-0">
                      <p className="text-body-strong [overflow-wrap:anywhere]" data-testid="invitation-email">
                        {inv.email}
                      </p>
                      {/* Role and date sit under the address at every width: beside the form at 1280 px the
                          table has about 600 px, too little for separate Role and Date columns. */}
                      <p className="text-small text-muted-foreground">
                        {ROLE_LABEL[inv.role]} · {dateLabel(inv, statusOf(inv), date)}
                      </p>
                    </div>
                  ),
                  className: "min-w-44",
                },
                { id: "status", header: "Status", cell: (inv) => <StatusChip status={statusOf(inv)} /> },
                {
                  id: "actions",
                  header: "Actions",
                  srOnlyHeader: true,
                  align: "right",
                  cell: (inv) => <div className="flex justify-end gap-2">{actions(inv)}</div>,
                },
              ]}
            />
            {cursor ? (
              <div className="mt-4 space-y-3">
                {moreError ? <FormMessage kind="error">{COPY.moreFailed}</FormMessage> : null}
                <Button
                  type="button"
                  variant="outline"
                  className="w-full sm:w-auto"
                  onClick={showMore}
                  disabled={!hydrated}
                  aria-disabled={loadingMore || undefined}
                  aria-busy={loadingMore || undefined}
                  data-testid="show-more"
                >
                  {loadingMore ? "Loading…" : "Show more invitations"}
                </Button>
              </div>
            ) : null}
          </>
        ) : null}
      </section>

      {revoking ? (
        <RevokeDialog
          key={revoking.key}
          open={revoking.open}
          onOpenChange={(open) => (open ? undefined : closeRevoke())}
          spaceId={spaceId}
          invitation={revoking.inv}
          onDone={() => onRevoked(revoking.inv)}
          onStale={() => {
            closeRevoke();
            void reload();
          }}
          finalFocus={revokeFinalFocus}
        />
      ) : null}
    </div>
  );
}

/** Resend and Revoke for one pending or expired row. Resend stays off while a 429 countdown runs. */
function RowActions({
  inv,
  state,
  enabled,
  onResend,
  onRevoke,
  onLimitEnd,
}: {
  inv: InvitationResponse;
  state?: RowState;
  enabled: boolean;
  onResend: () => void;
  onRevoke: () => void;
  onLimitEnd: () => void;
}) {
  const waiting = useWait(state, onLimitEnd) > 0;
  const busy = state?.busy;
  return (
    <>
      <Button
        type="button"
        variant="outline"
        size="sm"
        disabled={!enabled || busy === "revoke"}
        // aria-disabled (not disabled) keeps focus on the button while it is busy or waiting.
        aria-disabled={busy === "resend" || waiting || undefined}
        aria-busy={busy === "resend" || undefined}
        aria-label={`Resend invitation to ${inv.email}`}
        onClick={() => {
          if (busy || waiting) return;
          onResend();
        }}
        data-testid="resend"
      >
        {busy === "resend" ? "Sending…" : "Resend"}
      </Button>
      <Button
        type="button"
        variant="outline"
        size="sm"
        disabled={!enabled || busy === "resend"}
        aria-label={`Revoke invitation to ${inv.email}`}
        onClick={onRevoke}
        data-testid="revoke"
      >
        Revoke
      </Button>
    </>
  );
}

/** Seconds left of a 429 countdown (0 when none or over). `onEnd` runs once when it reaches 0. */
function useWait(state: RowState | undefined, onEnd?: () => void): number {
  const limit = state?.limit;
  const countdown = limit?.limit.kind === "countdown" ? limit : undefined;
  const { remaining } = useCooldown(countdown?.at ?? null, countdown?.limit.kind === "countdown" ? countdown.limit.seconds : 0);
  const ended = React.useRef(false);
  React.useEffect(() => {
    if (!countdown) {
      ended.current = false;
      return;
    }
    // Only the first time the wait is over for this 429; `useCooldown` starts at the full wait.
    if (remaining <= 0 && !ended.current) {
      ended.current = true;
      onEnd?.();
    }
  }, [countdown, remaining, onEnd]);
  return countdown ? remaining : 0;
}

/** The row's own message: a success, an error, or the live resend countdown. */
function RowMessage({ state }: { state: RowState }) {
  const remaining = useWait(state);
  if (state.limit?.limit.kind === "countdown" && remaining > 0) {
    return (
      <p className="rounded-md bg-destructive-subtle px-3 py-2 text-small text-destructive" data-testid="resend-wait">
        You can resend this invitation again in {waitLabel(remaining)}.
      </p>
    );
  }
  if (!state.message) return null;
  return <FormMessage kind={state.message.kind}>{state.message.text}</FormMessage>;
}

/** Revoke a pending invitation (alert dialog: focus starts on Cancel). */
function RevokeDialog({
  open,
  onOpenChange,
  spaceId,
  invitation,
  onDone,
  onStale,
  finalFocus,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  spaceId: string;
  invitation: InvitationResponse;
  onDone: () => void;
  /** The invitation is no longer pending (someone else acted): close and reload the list. */
  onStale: () => void;
  finalFocus: () => HTMLElement | null;
}) {
  const cancel = React.useRef<HTMLButtonElement>(null);
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string>();

  async function revoke() {
    setBusy(true);
    setError(undefined);
    try {
      const api = await createBrowserApi();
      const { error: problem, response } = await api.DELETE("/api/v1/spaces/{space_id}/invitations/{invitation_id}", {
        params: { path: { space_id: spaceId, invitation_id: invitation.id } },
      });
      if (response.ok) {
        onDone();
        return;
      }
      if (response.status === 409 || response.status === 404) {
        onStale();
        return;
      }
      setError(refusal(response.status, problem).text);
    } catch {
      setError("We could not revoke that invitation. Check your connection and try again.");
    }
    setBusy(false);
  }

  return (
    <ResponsiveDialog
      alert
      open={open}
      onOpenChange={onOpenChange}
      busy={busy}
      title="Revoke this invitation?"
      description={`${invitation.email} can no longer use the link. You can invite them again later.`}
      initialFocus={cancel}
      finalFocus={finalFocus}
      footer={
        <>
          <Button type="button" variant="destructive" onClick={revoke} disabled={busy} aria-busy={busy || undefined} data-testid="confirm-revoke">
            {busy ? "Revoking…" : "Revoke invitation"}
          </Button>
          <Button ref={cancel} type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={busy}>
            Cancel
          </Button>
        </>
      }
    >
      {error ? <FormMessage kind="error">{error}</FormMessage> : null}
    </ResponsiveDialog>
  );
}
