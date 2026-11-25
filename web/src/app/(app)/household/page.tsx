import type { Metadata } from "next";
import { Users } from "lucide-react";
import { PlaceholderPage } from "@/components/layout/placeholder-page";

export const metadata: Metadata = { title: "Household" };

export default function HouseholdPage() {
  return (
    <PlaceholderPage
      title="Household"
      description="Share finances with the people you live with."
      icon={Users}
      emptyTitle="Share your finances with family"
      emptyDescription="Invite a partner or family member by email. They see only what you share."
      actionLabel="Invite a member"
      actionHref="/household"
    />
  );
}
