import type { Metadata } from "next";
import { CreateHouseholdForm } from "@/components/households/create-household-form";
import { PageHeader } from "@/components/layout/page-header";

export const metadata: Metadata = { title: "Create a household" };

export default function CreateHouseholdPage() {
  return (
    <>
      {/* No space badge: the household does not exist yet. */}
      <PageHeader
        title="Create a household"
        description="Name the shared space. Everyone you invite sees the name."
        backLink={{ label: "Households", href: "/household" }}
      />
      <CreateHouseholdForm />
    </>
  );
}
