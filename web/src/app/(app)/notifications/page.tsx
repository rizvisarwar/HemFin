import type { Metadata } from "next";
import { Bell } from "lucide-react";
import { PlaceholderPage } from "@/components/layout/placeholder-page";

export const metadata: Metadata = { title: "Notifications" };

export default function NotificationsPage() {
  return (
    <PlaceholderPage
      title="Notifications"
      description="Renewals and payments that need your attention."
      icon={Bell}
      emptyTitle="You are all caught up"
      emptyDescription="We will tell you here when a renewal or payment is coming up."
      actionLabel="Review your contracts"
      actionHref="/contracts"
    />
  );
}
