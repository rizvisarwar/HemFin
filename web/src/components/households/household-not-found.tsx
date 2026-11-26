import Link from "next/link";
import { PageHeader } from "@/components/layout/page-header";
import { buttonVariants } from "@/components/ui/button";

/**
 * Any /household/[spaceId]/* route whose space the API does not return: missing, not a member, or a
 * personal space. One screen for all of them, so it never says whether the household exists
 * (docs/design/households.md 6.10). No space badge.
 */
export function HouseholdNotFound() {
  return (
    <div className="max-w-[640px]" data-testid="household-not-found">
      <PageHeader
        title="We could not find that household"
        description="Check the link, or choose a household from your list."
        backLink={{ label: "Households", href: "/household" }}
        primaryAction={
          <Link href="/household" className={buttonVariants()}>
            Go to households
          </Link>
        }
      />
    </div>
  );
}
