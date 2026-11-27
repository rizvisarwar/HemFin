"use client";

import Link from "next/link";
import { cn } from "@/lib/utils";

const LINKS = [
  { id: "entries", href: "/income", label: "Entries" },
  { id: "sources", href: "/income/sources", label: "Sources" },
] as const;

/**
 * Section links for the two income lists (finance.md 6.1): plain links with aria-current, styled as
 * tabs, like the household sections.
 */
export function IncomeNav({ current }: { current: "entries" | "sources" }) {
  return (
    <nav aria-label="Income sections" className="mb-4 md:mb-6">
      <ul className="flex gap-1 border-b border-border">
        {LINKS.map((l) => (
          <li key={l.id} className="shrink-0">
            <Link
              href={l.href}
              aria-current={l.id === current ? "page" : undefined}
              className={cn(
                "-mb-px inline-flex min-h-11 items-center border-b-2 px-3 text-body font-medium transition-colors hover:text-foreground",
                l.id === current ? "border-primary text-foreground" : "border-transparent text-muted-foreground",
              )}
            >
              {l.label}
            </Link>
          </li>
        ))}
      </ul>
    </nav>
  );
}
