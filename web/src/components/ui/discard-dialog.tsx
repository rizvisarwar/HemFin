"use client";

import { Button } from "@/components/ui/button";
import { DISMISS_FOCUS_CLASS } from "@/components/ui/confirm-dialog";
import { ResponsiveDialog } from "@/components/ui/responsive-dialog";

/**
 * "Discard changes?" for a form with unsaved edits (finance.md F18, 3.10). "Keep editing" takes focus
 * first. Render it inside the form's dialog, so it stacks above it.
 */
export function DiscardDialog({
  open,
  onOpenChange,
  description,
  onDiscard,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** For example "Your changes to this contract are not saved." */
  description: string;
  onDiscard: () => void;
}) {
  return (
    <ResponsiveDialog
      alert
      open={open}
      onOpenChange={onOpenChange}
      title="Discard changes?"
      description={description}
      initialFocus={() => document.getElementById("keep-editing")}
      footer={
        <>
          <Button type="button" variant="destructive" onClick={onDiscard}>
            Discard changes
          </Button>
          <Button id="keep-editing" type="button" variant="outline" className={DISMISS_FOCUS_CLASS} onClick={() => onOpenChange(false)}>
            Keep editing
          </Button>
        </>
      }
    />
  );
}
