import * as React from "react";
import { Logo } from "./logo";

export interface AuthLayoutProps {
  children: React.ReactNode; // the form
  title: string; // h1
  description?: string;
  banner?: string; // for example an invitation notice
  brandPanel?: boolean; // true on desktop only, split layout
  titleRef?: React.Ref<HTMLHeadingElement>; // lets a page move focus to the h1 when its state changes
  titleIcon?: React.ReactNode; // decorative icon before the title (for example a success check)
}

const POINTS = [
  "Contracts and renewal reminders",
  "Expenses and income, any currency",
  "Shared household view, by invite",
];

export function AuthLayout({
  children,
  title,
  description,
  banner,
  brandPanel = true,
  titleRef,
  titleIcon,
}: AuthLayoutProps) {
  return (
    <div className="flex min-h-dvh flex-col xl:flex-row">
      {brandPanel ? (
        <aside className="hidden border-r border-border bg-card px-12 py-8 xl:flex xl:w-1/2 xl:flex-col">
          <Logo href="/" />
          <div className="my-auto max-w-lg">
            <p className="text-display text-balance">Household finances, calm and in one place.</p>
            <p className="mt-6 text-lead text-muted-foreground">
              Personal money stays personal. Share a household with family only when you choose.
            </p>
            <ul className="mt-6 space-y-2 text-body">
              {POINTS.map((p) => (
                <li key={p}>{p}</li>
              ))}
            </ul>
          </div>
        </aside>
      ) : null}
      <div className="flex flex-1 flex-col">
        <div className={brandPanel ? "px-4 pt-2 md:px-6 xl:hidden" : "px-4 pt-2 md:px-6"}>
          <Logo href="/" className="justify-center md:justify-start" />
        </div>
        <main id="main" className="flex flex-1 items-start justify-center px-4 py-8 md:px-6 md:py-12 xl:items-center">
          <div className="w-full max-w-110 md:rounded-lg md:border md:border-border md:bg-card md:p-8 xl:max-w-100 xl:border-0 xl:bg-transparent xl:p-0">
            {banner ? (
              <p className="mb-4 rounded-md bg-accent px-3 py-2 text-small text-accent-foreground">{banner}</p>
            ) : null}
            <h1
              ref={titleRef}
              tabIndex={titleRef ? -1 : undefined}
              className={`text-h1 text-balance [overflow-wrap:anywhere]${titleRef ? " outline-none" : ""}${titleIcon ? " flex items-start gap-2" : ""}`}
            >
              {titleIcon}
              <span>{title}</span>
            </h1>
            {description ? <p className="mt-2 text-lead text-pretty text-muted-foreground">{description}</p> : null}
            <div className="mt-6">{children}</div>
          </div>
        </main>
      </div>
    </div>
  );
}
