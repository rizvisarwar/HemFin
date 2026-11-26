import { cn } from "@/lib/utils";

/** Form-level message. The live region exists from first render so changes are announced. */
export function FormMessage({
  kind,
  children,
  id,
}: {
  kind: "error" | "success" | "info";
  children?: React.ReactNode;
  id?: string;
}) {
  return (
    <div
      id={id}
      aria-live={kind === "error" ? "assertive" : "polite"}
      role={kind === "error" ? "alert" : "status"}
      data-testid="form-message"
    >
      {children ? (
        <p
          className={cn(
            "rounded-md px-3 py-2 text-small",
            kind === "error" && "bg-destructive-subtle text-destructive",
            kind === "success" && "bg-success-subtle text-success",
            kind === "info" && "bg-accent text-accent-foreground",
          )}
        >
          {children}
        </p>
      ) : null}
    </div>
  );
}
