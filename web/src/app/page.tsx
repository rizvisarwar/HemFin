import Link from "next/link";
import { Suspense } from "react";
import { BellRing, Lock, Users } from "lucide-react";
import { ApiStatus, ApiStatusBadge } from "@/components/api-status";
import { Logo } from "@/components/layout/logo";
import { Button } from "@/components/ui/button";
import { HemCard } from "@/components/ui/hem-card";
import { MoneyText } from "@/components/ui/money-text";
import { SpaceBadge } from "@/components/ui/space-badge";

const FEATURES = [
  {
    icon: Lock,
    title: "Personal stays private",
    text: "Only you see your personal records.",
  },
  {
    icon: Users,
    title: "Share a household",
    text: "Invite family by email. They see only what you choose to share.",
  },
  {
    icon: BellRing,
    title: "Never miss a renewal",
    text: "Get a reminder before a contract renews or a notice period ends.",
  },
];

export default function LandingPage() {
  return (
    <div className="flex min-h-dvh flex-col">
      <a
        href="#main"
        className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-50 focus:rounded-md focus:bg-primary focus:px-4 focus:py-3 focus:text-primary-foreground"
      >
        Skip to content
      </a>
      <header className="flex h-14 items-center justify-between border-b border-border px-4 md:h-16 md:px-6 xl:px-8">
        <Logo />
        <nav aria-label="Account" className="flex items-center gap-1">
          <Link
            href="/sign-in"
            className="inline-flex min-h-11 items-center rounded-md px-3 text-body font-medium hover:bg-accent"
          >
            Sign in
          </Link>
          <Button nativeButton={false} render={<Link href="/sign-in" />}>
            <span className="md:hidden">Create</span>
            <span className="hidden md:inline">Create account</span>
          </Button>
        </nav>
      </header>

      <main id="main" className="flex-1 px-4 py-8 md:px-6 md:py-12 xl:px-8">
        <div className="mx-auto w-full max-w-[1120px]">
          <section className="xl:grid xl:grid-cols-2 xl:items-center xl:gap-12">
            <div className="md:text-center xl:text-left">
              <h1 className="text-display">Household finances, calm and in one place.</h1>
              <p className="mt-4 text-lead text-muted-foreground md:mx-auto md:max-w-xl xl:mx-0">
                Track contracts, expenses and income, and see what renews next. Keep personal money
                private, and share a household when you want.
              </p>
              <div className="mt-6 flex flex-col gap-3 md:flex-row md:justify-center xl:justify-start">
                <Button size="lg" nativeButton={false} render={<Link href="/sign-in" />}>
                  Create a free account
                </Button>
                <Button size="lg" variant="secondary" nativeButton={false} render={<Link href="/sign-in" />}>
                  Sign in
                </Button>
              </div>
            </div>

            {/* Static, anonymised product preview. Desktop only, decorative. */}
            <div aria-hidden="true" className="hidden xl:block">
              <HemCard className="shadow-level-2">
                <div className="mb-4 flex items-center justify-between">
                  <span className="text-h3">Dashboard</span>
                  <SpaceBadge type="personal" label="Personal" />
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <HemCard variant="muted">
                    <p className="text-small text-muted-foreground">Next 30 days</p>
                    <MoneyText amount="1240.00" currency="EUR" size="lg" showCode />
                    <p className="text-small text-muted-foreground">3 payments due</p>
                  </HemCard>
                  <HemCard variant="muted">
                    <p className="text-small text-muted-foreground">Renewals</p>
                    <p className="text-body-strong">Car insurance</p>
                    <p className="text-small text-muted-foreground">3 Dec 2026</p>
                  </HemCard>
                </div>
              </HemCard>
            </div>
          </section>

          <section aria-label="Features" className="mt-10 grid gap-4 md:grid-cols-2 md:gap-6 xl:grid-cols-3">
            {FEATURES.map(({ icon: Icon, title, text }, i) => (
              <HemCard
                key={title}
                className={i === 2 ? "md:col-span-2 md:mx-auto md:w-[calc(50%-0.75rem)] xl:col-span-1 xl:w-auto" : undefined}
              >
                <Icon aria-hidden="true" className="mb-3 size-6 text-primary" />
                <h2 className="text-h3">{title}</h2>
                <p className="mt-1 text-body text-muted-foreground">{text}</p>
              </HemCard>
            ))}
          </section>
        </div>
      </main>

      <footer className="border-t border-border px-4 py-4 md:px-6 xl:px-8">
        <div className="mx-auto flex w-full max-w-[1120px] flex-wrap items-center gap-x-4 gap-y-2 text-small text-muted-foreground">
          <span>HemFin</span>
          <Suspense fallback={<ApiStatusBadge status="checking" />}>
            <ApiStatus />
          </Suspense>
        </div>
      </footer>
    </div>
  );
}
