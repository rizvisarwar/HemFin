"use client";

import * as React from "react";
import { Dialog as DialogPrimitive } from "@base-ui/react/dialog";
import { AlertDialog as AlertDialogPrimitive } from "@base-ui/react/alert-dialog";
import { XIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export interface ResponsiveDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description?: string;
  children?: React.ReactNode;
  /** Buttons row. Stacked full width on phone, right-aligned from md up. */
  footer?: React.ReactNode;
  /** A confirmation that interrupts the user (role alertdialog, does not close on an outside tap). */
  alert?: boolean;
  /** Dismiss is blocked while a request is running. */
  busy?: boolean;
  className?: string;
  /** Moves focus here when the dialog opens (default: the first focusable element). */
  initialFocus?: React.RefObject<HTMLElement | null> | (() => HTMLElement | null);
  /** Moves focus here when the dialog closes (default: the element that opened it). */
  finalFocus?: React.RefObject<HTMLElement | null> | (() => HTMLElement | null);
}

/**
 * A dialog on md and up, a bottom sheet on phone (design-system: overlays). One component, so the
 * focus trap, Escape, scroll lock and aria wiring are the same everywhere. Content is only mounted
 * while open.
 */
export function ResponsiveDialog({
  open,
  onOpenChange,
  title,
  description,
  children,
  footer,
  alert,
  busy,
  className,
  initialFocus,
  finalFocus,
}: ResponsiveDialogProps) {
  const Root = alert ? AlertDialogPrimitive.Root : DialogPrimitive.Root;
  const Portal = alert ? AlertDialogPrimitive.Portal : DialogPrimitive.Portal;
  const Backdrop = alert ? AlertDialogPrimitive.Backdrop : DialogPrimitive.Backdrop;
  const Popup = alert ? AlertDialogPrimitive.Popup : DialogPrimitive.Popup;
  const Title = alert ? AlertDialogPrimitive.Title : DialogPrimitive.Title;
  const Description = alert ? AlertDialogPrimitive.Description : DialogPrimitive.Description;

  return (
    <Root
      open={open}
      onOpenChange={(next) => {
        if (!next && busy) return;
        onOpenChange(next);
      }}
    >
      <Portal>
        <Backdrop className="fixed inset-0 z-50 bg-black/40 transition-opacity duration-150 data-ending-style:opacity-0 data-starting-style:opacity-0" />
        <Popup
          data-slot="responsive-dialog"
          initialFocus={initialFocus}
          finalFocus={finalFocus}
          className={cn(
            "fixed z-50 flex max-h-[90dvh] flex-col bg-popover text-popover-foreground shadow-lg outline-none transition duration-200 data-ending-style:opacity-0 data-starting-style:opacity-0",
            // Phone: bottom sheet.
            "inset-x-0 bottom-0 rounded-t-xl border-t border-border data-ending-style:translate-y-8 data-starting-style:translate-y-8",
            // md and up: centred dialog.
            "md:inset-x-auto md:bottom-auto md:left-1/2 md:top-1/2 md:w-[calc(100%-2rem)] md:max-w-md md:-translate-x-1/2 md:-translate-y-1/2 md:rounded-xl md:border md:data-ending-style:translate-y-[-48%] md:data-starting-style:translate-y-[-48%]",
            className,
          )}
        >
          <div aria-hidden="true" className="mx-auto mt-2 h-1 w-10 shrink-0 rounded-full bg-border md:hidden" />
          <div className="flex items-start gap-2 px-4 pt-3 md:px-6 md:pt-5">
            <div className="min-w-0 flex-1">
              <Title className="text-h3">{title}</Title>
              {description ? (
                <Description className="mt-1 text-body text-muted-foreground">{description}</Description>
              ) : null}
            </div>
            {/* A confirmation has a Cancel button, so it has no close X. */}
            {alert ? null : (
              <DialogPrimitive.Close
                disabled={busy}
                render={<Button variant="ghost" size="icon" className="-mr-2 -mt-1 shrink-0" />}
              >
                <XIcon aria-hidden="true" />
                <span className="sr-only">Close</span>
              </DialogPrimitive.Close>
            )}
          </div>
          {children ? <div data-dialog-scroll className="min-h-0 flex-1 overflow-y-auto px-4 py-4 md:px-6">{children}</div> : null}
          {footer ? (
            <div className="flex flex-col gap-2 border-t border-border px-4 py-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] md:flex-row-reverse md:px-6 md:pb-4 [&>*]:w-full md:[&>*]:w-auto">
              {footer}
            </div>
          ) : null}
        </Popup>
      </Portal>
    </Root>
  );
}
