import type { Metadata } from "next";
import { Paperclip } from "lucide-react";
import { PlaceholderPage } from "@/components/layout/placeholder-page";

export const metadata: Metadata = { title: "Documents" };

export default function DocumentsPage() {
  return (
    <PlaceholderPage
      title="Documents"
      description="Contracts and receipts, kept with the records they belong to."
      icon={Paperclip}
      emptyTitle="No documents yet"
      emptyDescription="Upload a contract or receipt and keep it next to its record."
      actionLabel="Upload a document"
      actionHref="/documents"
    />
  );
}
