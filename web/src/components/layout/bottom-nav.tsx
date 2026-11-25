"use client";

import * as React from "react";
import Link from "next/link";
import { ChevronRight, Ellipsis, LogOut } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import { isActivePath } from "./nav-items";
import type { NavItem } from "./types";

export interface BottomNavProps {
  items: NavItem[]; // placement === "bottom" (4 items)
  moreItems: NavItem[]; // placement === "more" (7 items), shown in the More sheet
  currentPath: string;
  notificationCount?: number;
}

const slot =
  "relative flex min-h-16 min-w-0 flex-1 flex-col items-center justify-center gap-0.5 text-caption outline-none";

export function BottomNav({ items, moreItems, currentPath, notificationCount = 0 }: BottomNavProps) {
  const [moreOpen, setMoreOpen] = React.useState(false);
  const moreActive = moreItems.some((i) => isActivePath(currentPath, i.href));

  return (
    <nav
      aria-label="Main"
      data-testid="bottom-nav"
      className="fixed inset-x-0 bottom-0 z-40 border-t border-border bg-background pb-[env(safe-area-inset-bottom)] md:hidden"
    >
      <ul className="flex">
        {items.map((item) => {
          const active = isActivePath(currentPath, item.href);
          const Icon = item.icon;
          const count = item.key === "notifications" ? notificationCount : 0;
          return (
            <li key={item.key} className="flex flex-1">
              <Link
                href={item.href}
                aria-current={active ? "page" : undefined}
                aria-label={count > 0 ? `${item.shortLabel ?? item.label}, ${count} unread` : undefined}
                className={cn(slot, active ? "font-semibold text-foreground" : "text-muted-foreground")}
              >
                <span
                  className={cn(
                    "relative flex h-6 w-8 items-center justify-center rounded-full",
                    active && "bg-accent",
                  )}
                >
                  <Icon aria-hidden="true" className="size-6" />
                  {count > 0 ? (
                    <span
                      aria-hidden="true"
                      className="absolute -right-2 -top-1.5 inline-flex min-w-4 items-center justify-center rounded-full bg-destructive px-1 text-[10px] font-semibold leading-4 text-destructive-foreground"
                    >
                      {count > 99 ? "99+" : count}
                    </span>
                  ) : null}
                </span>
                <span>{item.shortLabel ?? item.label}</span>
              </Link>
            </li>
          );
        })}
        <li className="flex flex-1">
          <Sheet open={moreOpen} onOpenChange={setMoreOpen}>
            <SheetTrigger
              aria-current={moreActive ? "page" : undefined}
              className={cn(slot, moreActive ? "font-semibold text-foreground" : "text-muted-foreground")}
            >
              <span
                className={cn(
                  "flex h-6 w-8 items-center justify-center rounded-full",
                  moreActive && "bg-accent",
                )}
              >
                <Ellipsis aria-hidden="true" className="size-6" />
              </span>
              <span>More</span>
            </SheetTrigger>
            <SheetContent side="bottom" className="rounded-t-xl pb-[env(safe-area-inset-bottom)]">
              <SheetHeader>
                <SheetTitle className="text-h3">More</SheetTitle>
              </SheetHeader>
              <nav aria-label="More" className="px-2">
                <ul>
                  {moreItems.map((item) => {
                    const active = isActivePath(currentPath, item.href);
                    const Icon = item.icon;
                    return (
                      <li key={item.key}>
                        <Link
                          href={item.href}
                          onClick={() => setMoreOpen(false)}
                          aria-current={active ? "page" : undefined}
                          className={cn(
                            "flex min-h-14 items-center gap-3 rounded-md px-3 text-body hover:bg-accent",
                            active && "bg-accent font-bold",
                          )}
                        >
                          <Icon aria-hidden="true" className="size-6" />
                          <span className="flex-1">{item.label}</span>
                          <ChevronRight aria-hidden="true" className="size-5 text-muted-foreground" />
                        </Link>
                      </li>
                    );
                  })}
                </ul>
              </nav>
              <div className="mx-2 mb-3 border-t border-border pt-2">
                <Link
                  href="/sign-in"
                  onClick={() => setMoreOpen(false)}
                  className="flex min-h-14 items-center gap-3 rounded-md px-3 text-body hover:bg-accent"
                >
                  <LogOut aria-hidden="true" className="size-6" />
                  Sign out
                </Link>
              </div>
            </SheetContent>
          </Sheet>
        </li>
      </ul>
    </nav>
  );
}
