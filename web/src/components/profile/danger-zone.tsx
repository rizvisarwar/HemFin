import { Button } from "@/components/ui/button";
import { HemCard } from "@/components/ui/hem-card";

/**
 * Placeholder for account deletion. It is a disabled button with an explanation, so nothing here
 * can be actioned until the real flow (with its own confirmation and data export) exists.
 */
export function DangerZone() {
  return (
    <section aria-labelledby="danger-heading">
      <HemCard className="border-destructive/40">
        <h2 id="danger-heading" className="text-h2 text-destructive">
          Danger zone
        </h2>
        <p id="danger-note" className="mt-2 text-body text-muted-foreground">
          Deleting your account will remove your profile, addresses and personal space for good. This is not available yet. It will
          arrive in a later update, with a way to export your data first.
        </p>
        <Button type="button" variant="outline" className="mt-4 w-full sm:w-auto" disabled aria-describedby="danger-note" data-testid="delete-account">
          Delete account (coming soon)
        </Button>
      </HemCard>
    </section>
  );
}
