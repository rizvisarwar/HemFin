import type { Metadata } from "next";
import { FileText } from "lucide-react";
import { PlaceholderPage } from "@/components/layout/placeholder-page";

export const metadata: Metadata = { title: "Contracts" };

export default function ContractsPage() {
  return (
    <PlaceholderPage
      title="Contracts"
      description="Home and car policies, subscriptions and bills in one place."
      icon={FileText}
      emptyTitle="No contracts yet"
      emptyDescription="Add insurance, subscriptions and bills in one place. We will remind you before each one renews."
      actionLabel="Add a contract"
      actionHref="/contracts"
      secondaryLabel="Learn how reminders work"
      secondaryHref="/notifications"
    />
  );
}
