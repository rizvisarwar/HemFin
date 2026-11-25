import type { Metadata } from "next";
import Link from "next/link";
import { CalendarClock, FileText, Lightbulb, Receipt } from "lucide-react";
import { AppPageHeader } from "@/components/layout/app-page-header";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { HemCard } from "@/components/ui/hem-card";

export const metadata: Metadata = { title: "Dashboard" };

const cardTitle = "text-h3 mb-3";

export default function DashboardPage() {
  return (
    <>
      <AppPageHeader
        title="Dashboard"
        description="What is coming up, at a glance."
        primaryAction={
          <Button nativeButton={false} render={<Link href="/contracts" />}>
            Add a contract
          </Button>
        }
      />
      <div className="grid gap-6 md:grid-cols-2">
        <HemCard>
          <h2 className={cardTitle}>Next 30 days</h2>
          <EmptyState
            variant="inline"
            icon={CalendarClock}
            title="Nothing due yet"
            description="Payments due in the next 30 days will show here."
            primaryAction={{ label: "Add a contract", href: "/contracts" }}
          />
        </HemCard>
        <HemCard>
          <h2 className={cardTitle}>Renewals</h2>
          <EmptyState
            variant="inline"
            icon={FileText}
            title="No renewals yet"
            description="Add a contract and we will remind you before it renews."
            primaryAction={{ label: "Add a contract", href: "/contracts" }}
          />
        </HemCard>
        <HemCard>
          <h2 className={cardTitle}>Recent expenses</h2>
          <EmptyState
            variant="inline"
            icon={Receipt}
            title="No expenses this month"
            description="Record one-off payments to see where the money goes."
            primaryAction={{ label: "Add an expense", href: "/expenses" }}
          />
        </HemCard>
        <HemCard>
          <h2 className={cardTitle}>Suggestions</h2>
          <EmptyState
            variant="inline"
            icon={Lightbulb}
            title="No suggestions yet"
            description="Suggestions appear once we have a few months of contracts and expenses."
            primaryAction={{ label: "Add a contract", href: "/contracts" }}
          />
        </HemCard>
      </div>
    </>
  );
}
