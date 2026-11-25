import { expect, test } from "@playwright/test";
import { cn } from "../src/lib/utils";

test("cn keeps design-system type utilities next to colour classes", () => {
  expect(cn("text-caption text-muted-foreground").split(" ").sort()).toEqual([
    "text-caption",
    "text-muted-foreground",
  ]);
  for (const t of ["small", "body", "lead", "h1", "money"]) {
    expect(cn(`text-${t}`, "text-foreground")).toContain(`text-${t}`);
  }
  // Real conflicts still merge.
  expect(cn("text-small", "text-caption")).toBe("text-caption");
});
