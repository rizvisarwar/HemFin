"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { MapPin, Star } from "lucide-react";
import { createBrowserApi, type AddressResponse } from "@/lib/api";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { HemCard } from "@/components/ui/hem-card";
import { ResponsiveDialog } from "@/components/ui/responsive-dialog";
import { FormMessage } from "@/components/auth/form-parts";
import { addressLines, MAX_ADDRESSES } from "@/lib/profile/address";
import { ADDRESS_LIMIT_MESSAGE, NETWORK_MESSAGE, parseProblem } from "@/lib/profile/problem";
import { AddressFormDialog } from "./address-form-dialog";

type Editing = { address: AddressResponse | null } | null;

/**
 * The user's addresses: cards on phone, a two-column grid from md up. Add and edit use a dialog
 * (a bottom sheet on phone), delete asks first. After each change the list is read again from the
 * API, so the auto-default rules stay the API's business. Addresses are never logged.
 */
export function AddressesSection({ initial }: { initial: AddressResponse[] }) {
  const router = useRouter();
  const heading = React.useRef<HTMLHeadingElement>(null);
  const [list, setList] = React.useState(initial);
  const [editing, setEditing] = React.useState<Editing>(null);
  const [deleting, setDeleting] = React.useState<AddressResponse | null>(null);
  const [deleteBusy, setDeleteBusy] = React.useState(false);
  const [deleteError, setDeleteError] = React.useState<string>();
  const [busyId, setBusyId] = React.useState<string | null>(null);
  const [message, setMessage] = React.useState<{ kind: "error" | "success"; text: string } | null>(null);
  const cancelRef = React.useRef<HTMLButtonElement>(null);

  const full = list.length >= MAX_ADDRESSES;

  async function reload(): Promise<void> {
    try {
      const api = await createBrowserApi();
      const { data, response } = await api.GET("/api/v1/me/addresses");
      if (response.ok && data) {
        setList(data);
        return;
      }
    } catch {
      // fall through to a server refresh
    }
    router.refresh();
  }

  async function makeDefault(a: AddressResponse) {
    setMessage(null);
    setBusyId(a.id);
    try {
      const api = await createBrowserApi();
      const { response, error } = await api.POST("/api/v1/me/addresses/{address_id}/default", {
        params: { path: { address_id: a.id } },
      });
      if (response.ok) {
        await reload();
        setMessage({ kind: "success", text: `${a.label} is now your default address.` });
      } else {
        setMessage({ kind: "error", text: parseProblem(response.status, error).form ?? NETWORK_MESSAGE });
      }
    } catch {
      setMessage({ kind: "error", text: NETWORK_MESSAGE });
    }
    setBusyId(null);
  }

  async function confirmDelete() {
    if (!deleting) return;
    setDeleteError(undefined);
    setDeleteBusy(true);
    try {
      const api = await createBrowserApi();
      const { response, error } = await api.DELETE("/api/v1/me/addresses/{address_id}", {
        params: { path: { address_id: deleting.id } },
      });
      // 404 means it is already gone, which is what the user wanted.
      if (response.ok || response.status === 404) {
        const label = deleting.label;
        setDeleting(null);
        await reload();
        setMessage({ kind: "success", text: `${label} was deleted.` });
        heading.current?.focus(); // the deleted card (and the button that opened the dialog) is gone
      } else {
        setDeleteError(parseProblem(response.status, error).form ?? NETWORK_MESSAGE);
      }
    } catch {
      setDeleteError(NETWORK_MESSAGE);
    }
    setDeleteBusy(false);
  }

  return (
    <section aria-labelledby="addresses-heading" className="space-y-4" data-testid="addresses">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h2 id="addresses-heading" ref={heading} tabIndex={-1} className="text-h2 outline-none">
            Addresses
          </h2>
          <p className="mt-1 text-body text-muted-foreground">Places you use for home, work or billing. One of them is your default.</p>
        </div>
        {list.length > 0 ? (
          <Button
            type="button"
            className="w-full sm:w-auto"
            disabled={full}
            onClick={() => {
              setMessage(null);
              setEditing({ address: null });
            }}
          >
            Add address
          </Button>
        ) : null}
      </div>

      <FormMessage kind={message?.kind ?? "info"} id="addresses-message">
        {message?.text}
      </FormMessage>
      {full ? (
        <p className="rounded-md bg-warning-subtle px-3 py-2 text-small text-warning" data-testid="address-limit">
          {ADDRESS_LIMIT_MESSAGE}
        </p>
      ) : null}

      {list.length === 0 ? (
        <HemCard>
          <EmptyState
            variant="inline"
            icon={MapPin}
            titleAs="h3"
            title="No addresses yet"
            description="Add your home address and any others you use. Your first one becomes the default."
            primaryAction={{ label: "Add address", onClick: () => setEditing({ address: null }) }}
          />
        </HemCard>
      ) : (
        <ul className="grid gap-4 md:grid-cols-2" aria-label="Your addresses">
          {list.map((a) => (
            <li key={a.id} className="min-w-0">
              <HemCard className="flex h-full flex-col" data-testid="address-card">
                <div className="flex items-start justify-between gap-3">
                  <h3 className="min-w-0 break-words text-h3">{a.label}</h3>
                  {a.is_default ? (
                    <Badge variant="secondary" className="shrink-0">
                      <Star aria-hidden="true" data-icon="inline-start" />
                      Default
                    </Badge>
                  ) : null}
                </div>
                <address className="mt-2 flex-1 text-body not-italic text-muted-foreground">
                  {/* Phone: one summary clamped to two lines, so cards stay compact. md and up: every line. */}
                  <span className="md:hidden">
                    <span className="line-clamp-2 block break-words">{addressLines(a).slice(0, -1).join(", ")}</span>
                    {/* The country is the last line and always stays visible. */}
                    <span className="block break-words" data-testid="address-country">
                      {addressLines(a).at(-1)}
                    </span>
                  </span>
                  <span className="hidden md:block">
                    {addressLines(a).map((line, i) => (
                      <span key={i} className="block break-words">
                        {line}
                      </span>
                    ))}
                  </span>
                </address>
                <div className="mt-3 flex flex-wrap gap-2">
                  {!a.is_default ? (
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      disabled={busyId !== null}
                      onClick={() => makeDefault(a)}
                      // The accessible name starts with the visible text (WCAG 2.5.3, Label in Name).
                      aria-label={busyId === a.id ? undefined : `Set as default: ${a.label}`}
                      aria-busy={busyId === a.id || undefined}
                    >
                      {busyId === a.id ? "Saving…" : "Set as default"}
                    </Button>
                  ) : null}
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => {
                      setMessage(null);
                      setEditing({ address: a });
                    }}
                    aria-label={`Edit ${a.label}`}
                  >
                    Edit
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="text-destructive hover:text-destructive"
                    onClick={() => {
                      setMessage(null);
                      setDeleteError(undefined);
                      setDeleting(a);
                    }}
                    aria-label={`Delete ${a.label}`}
                  >
                    Delete
                  </Button>
                </div>
              </HemCard>
            </li>
          ))}
        </ul>
      )}

      <AddressFormDialog
        key={editing?.address?.id ?? "new"}
        open={editing !== null}
        onOpenChange={(open) => !open && setEditing(null)}
        address={editing?.address ?? null}
        isFirst={list.length === 0}
        onSaved={async (kind) => {
          setEditing(null);
          await reload();
          setMessage({ kind: "success", text: kind === "added" ? "Address added." : "Address saved." });
        }}
      />

      <ResponsiveDialog
        alert
        open={deleting !== null}
        onOpenChange={(open) => !open && setDeleting(null)}
        busy={deleteBusy}
        initialFocus={cancelRef}
        title="Delete this address?"
        description={
          deleting
            ? deleting.is_default
              ? `${deleting.label} is your default address. After deleting it you will have no default until you choose another. This cannot be undone.`
              : `${deleting.label} will be removed. This cannot be undone.`
            : undefined
        }
        footer={
          <>
            <Button type="button" variant="destructive" onClick={confirmDelete} disabled={deleteBusy} aria-busy={deleteBusy || undefined} data-testid="confirm-delete">
              {deleteBusy ? "Deleting…" : "Delete address"}
            </Button>
            <Button ref={cancelRef} type="button" variant="outline" onClick={() => setDeleting(null)} disabled={deleteBusy}>
              Cancel
            </Button>
          </>
        }
      >
        <FormMessage kind="error">{deleteError}</FormMessage>
      </ResponsiveDialog>
    </section>
  );
}
