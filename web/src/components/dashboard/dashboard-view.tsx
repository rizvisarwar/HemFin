"use client";

import Link from "next/link";
import { CalendarClock, CircleHelp, CreditCard, RefreshCw, Wallet } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { useFormat } from "@/components/format-provider";
import { AppPageHeader } from "@/components/layout/app-page-header";
import { useActiveSpace } from "@/components/layout/app-shell-client";
import { Button } from "@/components/ui/button";
import { DueChip } from "@/components/ui/due-chip";
import { EmptyState } from "@/components/ui/empty-state";
import { FormMessage } from "@/components/ui/form-message";
import { HemCard } from "@/components/ui/hem-card";
import { MoneyText } from "@/components/ui/money-text";
import { Skeleton } from "@/components/ui/skeleton";
import { StatCard } from "@/components/ui/stat-card";
import type { DashboardEventResponse, DashboardResponse } from "@/lib/api";
import {
  daysUntil,
  dueChip,
  EVENT_LABEL,
  isFirstRun,
  isZeroAmount,
  monthLabel,
  unconvertedHint,
} from "@/lib/dashboard/dashboard";

const EVENT_ICON: Record<DashboardEventResponse["type"], LucideIcon> = {
  payment: CreditCard,
  renewal: RefreshCw,
  notice_deadline: CalendarClock,
};

function Event({ event, base, today }: { event: DashboardEventResponse; base: string; today: string }) {
  const { calendarDate } = useFormat();
  const Icon = EVENT_ICON[event.type];
  const chip = dueChip(event.type, daysUntil(event.date, today));
  // Below xl: a stacked card. From xl: one row of fixed columns (the wrapper "contents" lets its
  // children join the grid, and `order` puts the columns in the spec's order).
  return (
    <li
      data-testid="upcoming-event"
      className="min-w-0 rounded-lg border border-border bg-card p-4 xl:grid xl:grid-cols-[14rem_minmax(0,1fr)_8rem_8rem_minmax(0,14rem)] xl:items-center xl:gap-x-4 xl:rounded-none xl:border-0 xl:border-b xl:bg-transparent xl:px-0 xl:py-3 xl:last:border-b-0"
    >
      <div className="flex items-start justify-between gap-3 xl:contents">
        <span className="inline-flex items-center gap-2 text-body-strong xl:order-1">
          <Icon aria-hidden="true" className="size-4 shrink-0" />
          {EVENT_LABEL[event.type]}
        </span>
        <span className="shrink-0 whitespace-nowrap text-small text-muted-foreground xl:order-3 xl:text-foreground">
          {calendarDate(event.date)}
        </span>
      </div>
      <Link
        href={`/contracts/${event.contract_id}`}
        className="mt-1 flex min-h-11 min-w-0 items-center text-body text-primary underline-offset-4 hover:underline xl:order-2 xl:mt-0"
      >
        <span className="line-clamp-2 break-words">{event.contract_name}</span>
      </Link>
      {event.amount ? (
        <div className="whitespace-nowrap xl:order-4 xl:text-right">
          <MoneyText
            amount={event.amount.amount}
            currency={event.amount.currency}
            showCode={event.amount.currency !== base}
          />
        </div>
      ) : (
        <div aria-hidden="true" className="hidden xl:order-4 xl:block" />
      )}
      {chip ? (
        <div className="mt-2 xl:order-5 xl:mt-0 xl:text-right">
          <DueChip tone={chip.tone}>{chip.text}</DueChip>
        </div>
      ) : null}
    </li>
  );
}

function Upcoming({ data, today }: { data: DashboardResponse; today: string }) {
  return (
    <section aria-labelledby="upcoming-heading" className="min-w-0 md:col-span-1 xl:col-span-3" data-testid="upcoming">
      <h2 id="upcoming-heading" className="mb-3 text-h2">
        Next 30 days
      </h2>
      {data.upcoming.length === 0 ? (
        <HemCard>
          <EmptyState
            variant="inline"
            icon={CalendarClock}
            title="Nothing due in 30 days"
            description="Payments, renewals and notice deadlines show here as they come up."
            secondaryAction={{ label: "Add a contract", href: "/contracts" }}
            space="active"
            titleAs="h3"
          />
        </HemCard>
      ) : (
        <ul className="space-y-3 xl:space-y-0 xl:rounded-lg xl:border xl:border-border xl:bg-card xl:px-5">
          {data.upcoming.map((e) => (
            <Event key={`${e.type}-${e.contract_id}-${e.date}`} event={e} base={data.base_currency} today={today} />
          ))}
        </ul>
      )}
      <Link
        href="/contracts"
        className="mt-3 inline-flex min-h-11 items-center text-small font-medium text-primary underline-offset-4 hover:underline"
      >
        Contracts and expenses in one place. See all
      </Link>
    </section>
  );
}

function HouseholdPrivacy() {
  const space = useActiveSpace();
  if (space.type !== "household") return null;
  return (
    <p className="mt-4 text-center text-small text-muted-foreground" data-testid="first-run-privacy">
      Household members see only what the household shares.
    </p>
  );
}

export function DashboardView({ data, today }: { data: DashboardResponse; today: string }) {
  if (isFirstRun(data)) {
    return (
      <>
        <AppPageHeader title="Dashboard" />
        <div data-testid="dashboard-first-run">
          <EmptyState
            icon={Wallet}
            title="Start with your bills"
            description="Add a contract or record an expense. Totals and upcoming payments appear here once you have a few records."
            primaryAction={{ label: "Add a contract", href: "/contracts" }}
            secondaryAction={{ label: "Record an expense instead", href: "/expenses" }}
            space="active"
          />
          <HouseholdPrivacy />
        </div>
      </>
    );
  }

  const month = monthLabel(data.month);
  const { spent_this_month: spent, recurring_monthly: recurring, income_this_month: income } = data;
  return (
    <>
      <AppPageHeader
        title="Dashboard"
        primaryAction={
          <Button nativeButton={false} render={<Link href="/expenses" />}>
            Add an expense
          </Button>
        }
      />
      <div data-testid="dashboard">
        {data.unconverted_count > 0 ? (
          <div className="mb-4" data-testid="unconverted-hint">
            <FormMessage kind="info">
              <span className="inline-flex items-start gap-2">
                <CircleHelp aria-hidden="true" className="mt-0.5 size-4 shrink-0" />
                <span>{unconvertedHint(data.unconverted_count, data.base_currency)}</span>
              </span>
            </FormMessage>
          </div>
        ) : null}
        <div className="grid gap-4 md:grid-cols-2 md:gap-6 xl:grid-cols-3">
          <StatCard
            title="Spent this month"
            value={<MoneyText amount={spent.amount} currency={spent.currency} size="lg" />}
            hint={isZeroAmount(spent.amount) ? "No expenses this month yet. Record one to see it here." : month}
          />
          <StatCard
            title="Recurring cost"
            value={
              <span className="flex flex-wrap items-baseline gap-x-2">
                <MoneyText amount={recurring.amount} currency={recurring.currency} size="lg" />
                <span className="text-small text-muted-foreground">a month</span>
              </span>
            }
            hint="Contracts, as a monthly amount"
          />
          <StatCard
            title="Income this month"
            value={<MoneyText amount={income.amount} currency={income.currency} size="lg" signDisplay="exceptZero" />}
            hint={
              isZeroAmount(income.amount)
                ? "No income this month yet. Record some to see it here."
                : `Received in ${month}`
            }
            className="md:col-span-1 md:self-start xl:self-auto"
          />
          <Upcoming data={data} today={today} />
        </div>
      </div>
    </>
  );
}

export function DashboardError() {
  return (
    <>
      <AppPageHeader title="Dashboard" />
      <div data-testid="dashboard-error">
        <FormMessage kind="error">We could not load your summary just now.</FormMessage>
      </div>
    </>
  );
}

export function DashboardSkeleton() {
  return (
    <div aria-busy="true" data-testid="dashboard-loading">
      <p className="sr-only" role="status">
        Loading your summary
      </p>
      <Skeleton className="mb-6 h-8 w-48" />
      <div className="grid gap-4 md:grid-cols-2 md:gap-6 xl:grid-cols-3">
        <Skeleton className="h-32 w-full" />
        <Skeleton className="h-32 w-full" />
        <Skeleton className="h-32 w-full" />
        <div className="space-y-3 md:col-span-1 xl:col-span-3">
          <Skeleton className="h-24 w-full" />
          <Skeleton className="h-24 w-full" />
          <Skeleton className="h-24 w-full" />
        </div>
      </div>
    </div>
  );
}
