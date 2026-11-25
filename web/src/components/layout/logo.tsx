import Link from "next/link";
import { cn } from "@/lib/utils";

/** HemFin logo mark: a house-shaped monogram. Decorative, the wordmark carries the name. */
export function Logo({
  href = "/",
  showWordmark = true,
  className,
}: {
  href?: string;
  showWordmark?: boolean;
  className?: string;
}) {
  return (
    <Link
      href={href}
      aria-label="HemFin home"
      className={cn("inline-flex min-h-11 items-center gap-2 text-h3", className)}
    >
      <span
        aria-hidden="true"
        className="flex size-6 items-center justify-center rounded-sm bg-primary text-caption font-bold text-primary-foreground"
      >
        H
      </span>
      {showWordmark ? <span className="font-semibold">HemFin</span> : null}
    </Link>
  );
}
