"use client";

import * as React from "react";
import { Ellipsis } from "lucide-react";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";

/** Phone only: secondary page actions collapsed behind a 44 px "..." button. */
export function PageHeaderMoreActions({ children }: { children: React.ReactNode }) {
  return (
    <div className="md:hidden">
      <Sheet>
        <SheetTrigger
          aria-label="More actions"
          className="inline-flex size-11 items-center justify-center rounded-md border border-border bg-background hover:bg-accent"
        >
          <Ellipsis aria-hidden="true" className="size-5" />
        </SheetTrigger>
        <SheetContent side="bottom" className="rounded-t-xl pb-[env(safe-area-inset-bottom)]">
          <SheetHeader>
            <SheetTitle className="text-h3">Actions</SheetTitle>
          </SheetHeader>
          <div className="flex flex-col gap-2 px-4 pb-4">{children}</div>
        </SheetContent>
      </Sheet>
    </div>
  );
}
