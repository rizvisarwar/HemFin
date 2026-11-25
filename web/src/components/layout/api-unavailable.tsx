import { signOut } from "@/app/auth/actions";
import { Button } from "@/components/ui/button";

/** Shown instead of the app shell when the API cannot confirm the signed-in user. */
export function ApiUnavailable() {
  return (
    <main id="main" className="mx-auto flex min-h-dvh max-w-md flex-col justify-center gap-4 px-4 py-8">
      <h1 className="text-h1">We could not load your account</h1>
      <p className="text-body text-muted-foreground">
        HemFin could not reach its server just now. Your data is safe. Try again in a moment.
      </p>
      <div className="flex flex-col gap-3 sm:flex-row">
        <a
          href="/dashboard"
          className="inline-flex h-11 w-full items-center justify-center rounded-md bg-primary px-4 text-base font-medium text-primary-foreground hover:bg-primary/80 sm:w-auto"
        >
          Try again
        </a>
        <form action={signOut}>
          <Button type="submit" variant="outline" className="w-full sm:w-auto">
            Sign out
          </Button>
        </form>
      </div>
    </main>
  );
}
