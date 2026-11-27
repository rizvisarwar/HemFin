"use client";

import * as React from "react";
import { Button } from "@/components/ui/button";
import { FormMessage } from "@/components/ui/form-message";
import { ResponsiveDialog } from "@/components/ui/responsive-dialog";

export interface ConfirmDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Names the item, for example "Delete Car insurance?". */
  title: string;
  /** What happens. */
  description: string;
  /** The action's own name, never "Cancel" (finance.md F11). */
  confirmLabel: string;
  busyLabel: string;
  /** The way out, for example "Keep contract". Focused first. */
  dismissLabel: string;
  destructive?: boolean;
  /** Runs the action. Returns an error message to show in the dialog, or nothing when it worked. */
  onConfirm: () => Promise<string | undefined>;
}

/** An alert dialog for an action the user should confirm (finance.md 3.11). Stays open on an error. */
export function ConfirmDialog({
  open,
  onOpenChange,
  title,
  description,
  confirmLabel,
  busyLabel,
  dismissLabel,
  destructive,
  onConfirm,
}: ConfirmDialogProps) {
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string>();

  async function confirm() {
    if (busy) return;
    setBusy(true);
    setError(undefined);
    const message = await onConfirm();
    // On success the button stays busy until the caller closes the dialog or leaves the page: no second click.
    if (message) {
      setBusy(false);
      setError(message);
    }
  }

  return (
    <ResponsiveDialog
      alert
      open={open}
      onOpenChange={onOpenChange}
      busy={busy}
      title={title}
      description={description}
      initialFocus={() => document.getElementById("confirm-dismiss")}
      footer={
        <>
          <Button
            type="button"
            variant={destructive ? "destructive" : "default"}
            disabled={busy}
            aria-busy={busy || undefined}
            onClick={confirm}
            data-testid="confirm-action"
          >
            {busy ? busyLabel : confirmLabel}
          </Button>
          <Button id="confirm-dismiss" type="button" variant="outline" className="focus:outline-2 focus:outline-offset-2 focus:outline-ring" disabled={busy} onClick={() => onOpenChange(false)}>
            {dismissLabel}
          </Button>
        </>
      }
    >
      {error ? <FormMessage kind="error">{error}</FormMessage> : null}
    </ResponsiveDialog>
  );
}
