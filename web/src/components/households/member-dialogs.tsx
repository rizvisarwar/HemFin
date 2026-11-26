"use client";

import * as React from "react";
import { createBrowserApi, type MemberResponse } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { FormMessage } from "@/components/ui/form-message";
import { ResponsiveDialog } from "@/components/ui/responsive-dialog";
import { displayName, problemDetail } from "@/lib/households/households";

const SAVE_FAILED = "We could not save that change. Refresh the page and try again.";
const NETWORK_FAILED = "We could not save that change. Check your connection and try again.";

const ROLE_COPY: Record<"admin" | "member", { label: string; help: string }> = {
  admin: { label: "Admin", help: "Can invite people, remove members and rename the household. Reads and writes shared records." },
  member: { label: "Member", help: "Reads and writes shared records." },
};

interface Common {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  spaceId: string;
  householdName: string;
  member: MemberResponse;
  /** Called after the API accepted the change; the dialog is closed by the caller. */
  onDone: (message: string) => void;
  /** Where focus goes when the dialog closes. */
  finalFocus: () => HTMLElement | null;
}

/** Runs one API call for a dialog and maps a refusal to the message the dialog shows. */
async function run(
  call: () => Promise<{ response: Response; error?: unknown }>,
): Promise<{ ok: true } | { ok: false; message: string }> {
  try {
    const { response, error } = await call();
    if (response.ok) return { ok: true };
    return { ok: false, message: problemDetail(error) ?? SAVE_FAILED };
  } catch {
    return { ok: false, message: NETWORK_FAILED };
  }
}

/** Change a member's role. The owner also reaches "Transfer ownership" from here. */
export function ChangeRoleDialog({
  open,
  onOpenChange,
  spaceId,
  member,
  onDone,
  finalFocus,
  onTransfer,
}: Common & { onTransfer: () => void }) {
  const name = displayName(member);
  const current: "admin" | "member" = member.role === "admin" ? "admin" : "member";
  const [role, setRole] = React.useState<"admin" | "member">(current);
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string>();

  async function save() {
    setBusy(true);
    setError(undefined);
    const api = await createBrowserApi().catch(() => null);
    const result = api
      ? await run(() =>
          api.PATCH("/api/v1/spaces/{space_id}/members/{user_id}", {
            params: { path: { space_id: spaceId, user_id: member.user_id } },
            body: { role },
          }),
        )
      : { ok: false as const, message: NETWORK_FAILED };
    setBusy(false);
    if (result.ok) onDone(`Role updated for ${name}.`);
    else setError(result.message);
  }

  return (
    <ResponsiveDialog
      open={open}
      onOpenChange={onOpenChange}
      busy={busy}
      title={`Change role for ${name}`}
      initialFocus={() => document.querySelector<HTMLElement>('input[name="role"]:checked')}
      finalFocus={finalFocus}
      footer={
        <>
          <Button type="button" onClick={save} disabled={busy || role === current} aria-busy={busy || undefined} data-testid="save-role">
            {busy ? "Saving…" : "Save role"}
          </Button>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={busy}>
            Cancel
          </Button>
        </>
      }
    >
      <div className="space-y-4" aria-busy={busy || undefined}>
        <FormMessage kind="error">{error}</FormMessage>
        <fieldset className="space-y-1">
          <legend className="sr-only">Role</legend>
          {(["admin", "member"] as const).map((value) => (
            <label key={value} className="flex min-h-11 cursor-pointer items-start gap-3 rounded-md py-2">
              <input
                type="radio"
                name="role"
                value={value}
                checked={role === value}
                onChange={() => setRole(value)}
                aria-describedby={`role-help-${value}`}
                className="mt-0.5 size-5 shrink-0 accent-primary"
              />
              <span className="min-w-0">
                <span className="block text-body-strong">{ROLE_COPY[value].label}</span>
                <span id={`role-help-${value}`} className="block text-small text-muted-foreground">
                  {ROLE_COPY[value].help}
                </span>
              </span>
            </label>
          ))}
        </fieldset>
        <div className="border-t border-border pt-4">
          <p className="text-small text-muted-foreground">Only one owner. To hand over the household, transfer ownership.</p>
          <Button type="button" variant="outline" className="mt-3 w-full sm:w-auto" onClick={onTransfer} disabled={busy}>
            Transfer ownership
          </Button>
        </div>
      </div>
    </ResponsiveDialog>
  );
}

/** Remove a member (alert dialog: focus starts on Cancel). */
export function RemoveMemberDialog({ open, onOpenChange, spaceId, householdName, member, onDone, finalFocus }: Common) {
  const name = displayName(member);
  const cancel = React.useRef<HTMLButtonElement>(null);
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string>();

  async function remove() {
    setBusy(true);
    setError(undefined);
    const api = await createBrowserApi().catch(() => null);
    const result = api
      ? await run(() =>
          api.DELETE("/api/v1/spaces/{space_id}/members/{user_id}", {
            params: { path: { space_id: spaceId, user_id: member.user_id } },
          }),
        )
      : { ok: false as const, message: NETWORK_FAILED };
    setBusy(false);
    if (result.ok) onDone(`${name} was removed from ${householdName}.`);
    else setError(result.message);
  }

  return (
    <ResponsiveDialog
      alert
      open={open}
      onOpenChange={onOpenChange}
      busy={busy}
      title={`Remove ${name}?`}
      description={`${name} loses access to the shared records of ${householdName}. They keep their personal space. An owner or admin can invite them again.`}
      initialFocus={cancel}
      finalFocus={finalFocus}
      footer={
        <>
          <Button type="button" variant="destructive" onClick={remove} disabled={busy} aria-busy={busy || undefined} data-testid="confirm-remove">
            {busy ? "Removing…" : "Remove member"}
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

/** Hand the household to another member. The current owner becomes an admin. */
export function TransferOwnershipDialog({ open, onOpenChange, spaceId, member, onDone, finalFocus }: Common) {
  const name = displayName(member);
  const cancel = React.useRef<HTMLButtonElement>(null);
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string>();

  async function transfer() {
    setBusy(true);
    setError(undefined);
    const api = await createBrowserApi().catch(() => null);
    const result = api
      ? await run(() =>
          api.POST("/api/v1/spaces/{space_id}/transfer-ownership", {
            params: { path: { space_id: spaceId } },
            body: { user_id: member.user_id },
          }),
        )
      : { ok: false as const, message: NETWORK_FAILED };
    setBusy(false);
    if (result.ok) onDone(`${name} is now the owner. You are an admin.`);
    else setError(result.message);
  }

  return (
    <ResponsiveDialog
      alert
      open={open}
      onOpenChange={onOpenChange}
      busy={busy}
      title={`Make ${name} the owner?`}
      description={`${name} becomes the only owner. They can rename or delete the household and change roles. You become an admin.`}
      initialFocus={cancel}
      finalFocus={finalFocus}
      footer={
        <>
          <Button type="button" onClick={transfer} disabled={busy} aria-busy={busy || undefined} data-testid="confirm-transfer">
            {busy ? "Transferring…" : "Transfer ownership"}
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
