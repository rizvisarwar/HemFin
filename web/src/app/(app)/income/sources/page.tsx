import type { Metadata } from "next";
import { SourcesView } from "@/components/income/sources-view";

export const metadata: Metadata = { title: "Income sources" };

export default function IncomeSourcesPage() {
  return <SourcesView />;
}
