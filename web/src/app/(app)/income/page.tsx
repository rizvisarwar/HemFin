import type { Metadata } from "next";
import { Banknote } from "lucide-react";
import { PlaceholderPage } from "@/components/layout/placeholder-page";

export const metadata: Metadata = { title: "Income" };

export default function IncomePage() {
  return (
    <PlaceholderPage
      title="Income"
      description="Salary and other money coming in."
      icon={Banknote}
      emptyTitle="No income yet"
      emptyDescription="Record your salary and other income to see the full picture each month."
      actionLabel="Add income"
      actionHref="/income"
    />
  );
}
