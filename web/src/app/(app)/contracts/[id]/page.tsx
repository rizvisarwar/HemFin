import type { Metadata } from "next";
import { ContractDetailView } from "@/components/contracts/contract-detail-view";

export const metadata: Metadata = { title: "Contract" };

export default async function ContractPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <ContractDetailView id={id} />;
}
