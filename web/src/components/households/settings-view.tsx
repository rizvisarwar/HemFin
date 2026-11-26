"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { setActiveSpace } from "@/app/actions";
import { useActiveSpace, useSpaces, useUserId } from "@/components/layout/app-shell-client";
import { Field, FieldError, useFocusFirstInvalid } from "@/components/auth/form-parts";
import { useHydrated } from "@/lib/hooks/use-hydrated";
import { Button } from "@/components/ui/button";
import { FormMessage } from "@/components/ui/form-message";
import { HemCard } from "@/components/ui/hem-card";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { ResponsiveDialog } from "@/components/ui/responsive-dialog";
import { createBrowserApi, type Role } from "@/lib/api";
import { setFlash } from "@/lib/households/flash";
import { canRename, problemDetail, validateHouseholdName } from "@/lib/households/households";
import { NETWORK_MESSAGE } from "@/lib/profile/problem";
import { useInputValue } from "./use-input-value";

const FAILED = "We could not save that change. Refresh the page and try again.";

/**
 * Household settings: rename (owner and admin), leave (everyone but the owner) and delete (owner).
 * Each part shows only to the roles that can use it; the API stays the authority and its message is
 * shown if a request is still refused.
 */
export function SettingsView({
  spaceId,
  name,
  viewerId,
  viewerRole,
}: {
  spaceId: string;
  name: string;
  viewerId: string;
  viewerRole: Role;
}) {
  return (
    <div className="max-w-[640px] space-y-4" data-testid="settings">
      <RenameCard spaceId={spaceId} name={name} viewerRole={viewerRole} />
      <LeaveCard spaceId={spaceId} name={name} viewerId={viewerId} viewerRole={viewerRole} />
      {viewerRole === "owner" ? <DeleteCard spaceId={spaceId} name={name} /> : null}
    </div>
  );
}

function RenameCard({ spaceId, name, viewerRole }: { spaceId: string; name: string; viewerRole: Role }) {
  const router = useRouter();
  const form = React.useRef<HTMLFormElement>(null);
  const hydrated = useHydrated();
  const [saved, setSaved] = React.useState(name);
  const [version, setVersion] = React.useState(0);
  const [error, setError] = React.useState<string>();
  const [message, setMessage] = React.useState<{ kind: "error" | "success"; text: string } | null>(null);
  const [busy, setBusy] = React.useState(false);
  const [attempt, setAttempt] = React.useState(0);
  const pressing = React.useRef(false);
  useFocusFirstInvalid(form, attempt);
  const typed = useInputValue("household-name");
  // The name changes elsewhere (another admin, or after router.refresh()): follow the server.
  const [seenName, setSeenName] = React.useState(name);
  if (name !== seenName) {
    setSeenName(name);
    setSaved(name);
    setVersion((v) => v + 1);
  }
  const changed = typed.trim() !== saved;

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (busy) return;
    const next = String(new FormData(e.currentTarget).get("household-name") ?? "").trim();
    const invalid = validateHouseholdName(next);
    if (invalid) {
      setError(invalid);
      setMessage(null);
      setAttempt((n) => n + 1);
      return;
    }
    setError(undefined);
    setMessage(null);
    setBusy(true);
    try {
      const api = await createBrowserApi();
      const { data, error: problem, response } = await api.PATCH("/api/v1/spaces/{space_id}", {
        params: { path: { space_id: spaceId } },
        body: { name: next },
      });
      if (response.ok && data) {
        setSaved(data.name);
        setSeenName(data.name);
        setVersion((v) => v + 1);
        setMessage({ kind: "success", text: "Household name saved." });
        router.refresh(); // the switcher, top bar, badge and list all show the new name
      } else {
        setMessage({ kind: "error", text: problemDetail(problem) ?? FAILED });
      }
    } catch {
      setMessage({ kind: "error", text: NETWORK_MESSAGE });
    }
    setBusy(false);
  }

  return (
    <HemCard>
      <section aria-labelledby="rename-heading">
        <h2 id="rename-heading" className="text-h2">
          Household name
        </h2>
        {canRename(viewerRole) ? (
          <>
            <div className={message ? "mt-3" : undefined}>
              <FormMessage kind={message?.kind ?? "info"} id="rename-message">
                {message?.text}
              </FormMessage>
            </div>
            {/* method="post": if the form is ever submitted without JavaScript, nothing goes into the URL. */}
            <form
              ref={form}
              method="post"
              noValidate
              onSubmit={onSubmit}
              onInput={() => message?.kind === "success" && setMessage(null)}
              aria-labelledby="rename-heading"
              aria-busy={busy || undefined}
              className="mt-4 space-y-4"
              data-testid="rename-form"
            >
              {/* Reserved error line: a blur message must not shift the Save button under a tap. */}
              <div key={version} className="[&_#household-name-error]:min-h-5">
                <Field
                  id="household-name"
                  label="Name"
                  autoComplete="off"
                  defaultValue={saved}
                  hint="Shown to everyone in the household."
                  error={error}
                  onFocus={() => (pressing.current = false)}
                  onBlur={(e) => {
                    if (pressing.current) return; // a press on Save blurs first (Safari does not focus the button); the submit validates
                    setError(validateHouseholdName(e.currentTarget.value) ?? undefined);
                  }}
                  onInput={(e) => error && setError(validateHouseholdName(e.currentTarget.value) ?? undefined)}
                />
              </div>
              <Button
                type="submit"
                className="w-full sm:w-auto"
                disabled={!hydrated || !changed}
                onPointerDown={() => (pressing.current = true)}
                onClick={() => (pressing.current = false)}
                aria-disabled={busy || undefined}
                aria-busy={busy || undefined}
                data-testid="save-name"
              >
                {busy ? "Saving…" : "Save changes"}
              </Button>
            </form>
          </>
        ) : (
          <div className="mt-3 space-y-2">
            <p className="break-words text-body-strong" data-testid="readonly-name">
              {name}
            </p>
            <p className="text-small text-muted-foreground">Only owners and admins can rename the household.</p>
          </div>
        )}
      </section>
    </HemCard>
  );
}

/** What to do after the user's membership of this household is gone: leave the cookie on a space that still exists. */
function useAfterGone(spaceId: string) {
  const active = useActiveSpace();
  const spaces = useSpaces();
  return React.useCallback(async () => {
    if (active.id !== spaceId) return;
    const personal = spaces.find((s) => s.type === "personal");
    if (personal) await setActiveSpace(personal.id);
  }, [active.id, spaceId, spaces]);
}

function LeaveCard({ spaceId, name, viewerId, viewerRole }: { spaceId: string; name: string; viewerId: string; viewerRole: Role }) {
  const router = useRouter();
  const afterGone = useAfterGone(spaceId);
  const userId = useUserId();
  const isOwner = viewerRole === "owner";
  const hydrated = useHydrated();
  const [open, setOpen] = React.useState(false);
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string>();
  const cancel = React.useRef<HTMLButtonElement>(null);

  async function leave() {
    setBusy(true);
    setError(undefined);
    try {
      const api = await createBrowserApi();
      const { error: problem, response } = await api.DELETE("/api/v1/spaces/{space_id}/members/{user_id}", {
        params: { path: { space_id: spaceId, user_id: viewerId } },
      });
      if (response.ok) {
        setFlash(userId, `You left ${name}.`);
        await afterGone();
        router.push("/household");
        return; // stays busy while the list loads
      }
      setError(problemDetail(problem) ?? FAILED);
    } catch {
      setError(NETWORK_MESSAGE);
    }
    setBusy(false);
  }

  return (
    <HemCard>
      <section aria-labelledby="leave-heading">
        <h2 id="leave-heading" className="text-h2">
          Leave household
        </h2>
        <p className="mt-2 text-body text-muted-foreground">
          You lose access to this household&apos;s shared records. Your personal space is not affected.
        </p>
        {isOwner ? (
          <>
            <p id="owner-leave-note" className="mt-2 text-body">
              You are the owner. Transfer ownership to another member before you leave.
            </p>
            <Button type="button" variant="outline" className="mt-4 w-full sm:w-auto" disabled aria-describedby="owner-leave-note" data-testid="leave-household">
              Leave household
            </Button>
            <Link
              href={`/household/${spaceId}/members`}
              className="mt-1 flex min-h-11 items-center text-body font-medium text-primary underline-offset-4 hover:underline"
            >
              Go to members to transfer ownership
            </Link>
          </>
        ) : (
          <Button
            type="button"
            variant="outline"
            className="mt-4 w-full text-destructive sm:w-auto"
            disabled={!hydrated}
            onClick={() => {
              setError(undefined);
              setOpen(true);
            }}
            data-testid="leave-household"
          >
            Leave household
          </Button>
        )}
      </section>
      <ResponsiveDialog
        alert
        open={open}
        onOpenChange={setOpen}
        busy={busy}
        title={`Leave ${name}?`}
        description="You lose access to this household's shared records. Your personal space is not affected. An owner or admin can invite you again."
        initialFocus={cancel}
        footer={
          <>
            <Button type="button" variant="destructive" onClick={leave} disabled={busy} aria-busy={busy || undefined} data-testid="confirm-leave">
              {busy ? "Leaving…" : "Leave household"}
            </Button>
            <Button ref={cancel} type="button" variant="outline" onClick={() => setOpen(false)} disabled={busy}>
              Cancel
            </Button>
          </>
        }
      >
        {error ? <FormMessage kind="error">{error}</FormMessage> : null}
      </ResponsiveDialog>
    </HemCard>
  );
}

function DeleteCard({ spaceId, name }: { spaceId: string; name: string }) {
  const router = useRouter();
  const afterGone = useAfterGone(spaceId);
  const userId = useUserId();
  const hydrated = useHydrated();
  const [open, setOpen] = React.useState(false);
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string>();
  const [typed, setTyped] = React.useState("");
  const [mismatch, setMismatch] = React.useState(false);
  const input = React.useRef<HTMLInputElement>(null);
  const matches = typed.trim() === name;

  async function remove() {
    if (!matches) return;
    setBusy(true);
    setError(undefined);
    try {
      const api = await createBrowserApi();
      const { error: problem, response } = await api.DELETE("/api/v1/spaces/{space_id}", {
        params: { path: { space_id: spaceId } },
      });
      if (response.ok) {
        setFlash(userId, `${name} was deleted.`);
        await afterGone();
        router.push("/household");
        return;
      }
      setError(problemDetail(problem) ?? FAILED);
    } catch {
      setError(NETWORK_MESSAGE);
    }
    setBusy(false);
  }

  return (
    <HemCard className="border-2 border-destructive/60">
      <section aria-labelledby="delete-heading">
        <h2 id="delete-heading" className="text-h2 text-destructive">
          Delete household
        </h2>
        <p className="mt-2 text-body text-muted-foreground">
          This permanently deletes the household and all shared data, for everyone. It cannot be undone.
        </p>
        <Button
          type="button"
          variant="destructive"
          className="mt-4 w-full sm:w-auto"
          disabled={!hydrated}
          onClick={() => {
            setTyped("");
            setMismatch(false);
            setError(undefined);
            setOpen(true);
          }}
          data-testid="delete-household"
        >
          Delete household
        </Button>
      </section>
      <ResponsiveDialog
        alert
        open={open}
        onOpenChange={setOpen}
        busy={busy}
        title={`Delete ${name}?`}
        description="This permanently deletes the household and all shared data, for everyone. Members lose access straight away. It cannot be undone."
        initialFocus={input}
        footer={
          <>
            <Button type="button" variant="destructive" onClick={remove} disabled={!matches || busy} aria-busy={busy || undefined} data-testid="confirm-delete">
              {busy ? "Deleting…" : "Delete household"}
            </Button>
            <Button type="button" variant="outline" onClick={() => setOpen(false)} disabled={busy}>
              Cancel
            </Button>
          </>
        }
      >
        <div className="space-y-3">
          {error ? <FormMessage kind="error">{error}</FormMessage> : null}
          <div className="space-y-2">
            <Label htmlFor="confirm-name" className="block text-body leading-snug">
              Type <span className="break-words font-semibold">{name}</span> to confirm
            </Label>
            <Input
              ref={input}
              id="confirm-name"
              autoComplete="off"
              autoCapitalize="none"
              spellCheck={false}
              value={typed}
              onChange={(e) => {
                setTyped(e.target.value);
                if (mismatch && e.target.value.trim() === name) setMismatch(false);
              }}
              onBlur={() => setMismatch(typed.trim() !== "" && !matches)}
              aria-invalid={mismatch || undefined}
              aria-describedby="confirm-name-hint confirm-name-error"
              disabled={busy}
            />
            <p id="confirm-name-hint" className="text-small text-muted-foreground">
              Type the name exactly as it appears above.
            </p>
            <FieldError id="confirm-name-error" error={mismatch ? "The name does not match. Type it exactly as shown above." : undefined} />
          </div>
        </div>
      </ResponsiveDialog>
    </HemCard>
  );
}
