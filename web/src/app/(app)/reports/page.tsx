import type { Metadata } from "next";
import { BarChart3 } from "lucide-react";
import { PlaceholderPage } from "@/components/layout/placeholder-page";

export const metadata: Metadata = { title: "Reports" };

export default function ReportsPage() {
  return (
    <PlaceholderPage
      title="Reports"
      description="A clear view of your money over time."
      icon={BarChart3}
      emptyTitle="No reports yet"
      emptyDescription="Reports appear once you have a few contracts, expenses or income records."
      actionLabel="Add a contract"
      actionHref="/contracts"
    />
  );
}
