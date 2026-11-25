import type { Metadata } from "next";
import { MessageSquare } from "lucide-react";
import { PlaceholderPage } from "@/components/layout/placeholder-page";

export const metadata: Metadata = { title: "Assistant" };

export default function AssistantPage() {
  return (
    <PlaceholderPage
      title="Assistant"
      description="Ask questions about your contracts, expenses and income."
      icon={MessageSquare}
      emptyTitle="Ask your first question"
      emptyDescription="The assistant answers from your own records. It only sees the space you have selected."
      actionLabel="Add a contract"
      actionHref="/contracts"
    />
  );
}
