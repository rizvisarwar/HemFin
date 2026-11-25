"use client";

import * as React from "react";
import Link from "next/link";
import { cn } from "@/lib/utils";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { isActivePath, NAV_GROUP_LABELS } from "./nav-items";
import type { NavGroup, NavItem } from "./types";

export interface SideNavProps {
  items: NavItem[]; // all items, grouped by `group`
  currentPath: string;
  /** Short reminder of the active space, shown at the bottom on desktop. */
  spaceNote?: string;
  // Rail (md) vs expanded (xl) is CSS only, so there is no variant prop.
}

const GROUP_ORDER: NavGroup[] = ["overview", "money", "insights", "account"];

export function SideNav({ items, currentPath, spaceNote }: SideNavProps) {
  return (
    <nav
      aria-label="Main"
      data-testid="side-nav"
      className="sticky top-16 hidden h-[calc(100dvh-4rem)] w-18 shrink-0 flex-col overflow-y-auto border-r border-border bg-background py-3 md:flex xl:w-64"
    >
      <div className="flex-1">
        {GROUP_ORDER.map((group, idx) => {
          const groupItems = items.filter((i) => i.group === group);
          if (groupItems.length === 0) return null;
          return (
            <div key={group} className={cn(idx > 0 && "mt-3 xl:mt-6")}>
              <p
                className={cn(
                  "hidden px-6 pb-1 text-small text-muted-foreground xl:block",
                )}
              >
                {NAV_GROUP_LABELS[group]}
              </p>
              {idx > 0 ? (
                <div aria-hidden="true" className="mx-4 mb-3 border-t border-border xl:hidden" />
              ) : null}
              <ul className="flex flex-col items-center gap-1 px-3 xl:items-stretch">
                {groupItems.map((item) => {
                  const active = isActivePath(currentPath, item.href);
                  const Icon = item.icon;
                  const count = item.badgeCount ?? 0;
                  return (
                    <li key={item.key} className="xl:w-full">
                      <Tooltip>
                        <TooltipTrigger
                          render={
                            <Link
                              href={item.href}
                              aria-label={count > 0 ? `${item.label}, ${count} unread` : item.label}
                              aria-current={active ? "page" : undefined}
                              className={cn(
                                "relative flex size-12 items-center justify-center rounded-md text-foreground outline-none transition-colors duration-150 ease-out hover:bg-accent xl:h-11 xl:w-full xl:justify-start xl:gap-3 xl:px-3",
                                active &&
                                  "bg-accent text-accent-foreground before:absolute before:inset-y-2 before:-left-3 before:w-0.5 before:rounded-full before:bg-primary xl:before:-left-3",
                              )}
                            />
                          }
                        >
                          <Icon aria-hidden="true" className="size-5 shrink-0" />
                          <span className="hidden flex-1 text-body xl:inline">{item.label}</span>
                          {count > 0 ? (
                            <span
                              aria-hidden="true"
                              className="absolute right-1 top-1 inline-flex min-w-5 items-center justify-center rounded-full bg-destructive px-1 text-caption text-destructive-foreground xl:static xl:ml-auto"
                            >
                              {count > 99 ? "99+" : count}
                            </span>
                          ) : null}
                        </TooltipTrigger>
                        <TooltipContent side="right" className="xl:hidden">
                          {item.label}
                        </TooltipContent>
                      </Tooltip>
                    </li>
                  );
                })}
              </ul>
            </div>
          );
        })}
      </div>
      {spaceNote ? (
        <p className="hidden px-6 pt-3 text-small text-muted-foreground xl:block">{spaceNote}</p>
      ) : null}
    </nav>
  );
}
