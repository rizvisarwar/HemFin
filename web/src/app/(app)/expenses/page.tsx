import type { Metadata } from "next";
import { Receipt } from "lucide-react";
import { PlaceholderPage } from "@/components/layout/placeholder-page";

export const metadata: Metadata = { title: "Expenses" };

export default function ExpensesPage() {
  return (
    <PlaceholderPage
      title="Expenses"
      description="Where the money goes, month by month."
      icon={Receipt}
      emptyTitle="No expenses this month"
      emptyDescription="Record one-off payments to see where the money goes."
      actionLabel="Add an expense"
      actionHref="/expenses"
    />
  );
}
