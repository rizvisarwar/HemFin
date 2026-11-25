import type { Metadata } from "next";
import { Lightbulb } from "lucide-react";
import { PlaceholderPage } from "@/components/layout/placeholder-page";

export const metadata: Metadata = { title: "Suggestions" };

export default function SuggestionsPage() {
  return (
    <PlaceholderPage
      title="Suggestions"
      description="Ideas to help you save, based on your records."
      icon={Lightbulb}
      emptyTitle="No suggestions yet"
      emptyDescription="Suggestions appear once we have a few months of contracts and expenses."
      actionLabel="Add a contract"
      actionHref="/contracts"
    />
  );
}
