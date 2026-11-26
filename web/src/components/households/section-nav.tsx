"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";

/**
 * Section links inside a household. They are plain links with aria-current (each section is its
 * own route), styled as tabs, not an ARIA tablist (docs/design/households.md D2).
 */
export function SectionNav({ spaceId, showInvitations }: { spaceId: string; showInvitations: boolean }) {
  const pathname = usePathname();
  const base = `/household/${spaceId}`;
  const links = [
    { href: `${base}/members`, label: "Members" },
    ...(showInvitations ? [{ href: `${base}/invitations`, label: "Invitations" }] : []),
    { href: `${base}/settings`, label: "Settings" },
  ];
  return (
    <nav aria-label="Household sections" className="mb-4 md:mb-6">
      {/* Scrolls inside its own row if it ever has to; at 375 px the three links fit. */}
      <ul className="flex gap-1 overflow-x-auto border-b border-border">
        {links.map((l) => {
          const current = pathname === l.href;
          return (
            <li key={l.href} className="shrink-0">
              <Link
                href={l.href}
                aria-current={current ? "page" : undefined}
                className={cn(
                  "-mb-px inline-flex min-h-11 items-center border-b-2 px-3 text-body font-medium transition-colors hover:text-foreground",
                  current ? "border-household text-foreground" : "border-transparent text-muted-foreground",
                )}
              >
                {l.label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
