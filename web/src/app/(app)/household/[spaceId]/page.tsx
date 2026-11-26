import { redirect } from "next/navigation";

/** /household/[spaceId] opens the Members section (docs/design/households.md D1). */
export default async function HouseholdIndexPage({ params }: { params: Promise<{ spaceId: string }> }) {
  const { spaceId } = await params;
  redirect(`/household/${encodeURIComponent(spaceId)}/members`);
}
