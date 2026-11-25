import { readFileSync } from "node:fs";
import { expect, test } from "@playwright/test";

// `next dev` reports prerender problems (for example "unstable value Date.now() while prerendering")
// in the server log and in the in-browser error overlay. Neither shows up in `next build` checks
// that only look at the final HTML, so this test loads real pages in dev mode and checks both.
const ROUTES = ["/", "/dashboard"];

const SERVER_ERROR = /Error:|unstable value|while prerendering|blocking-prerender|Blocking Route|Uncached data was accessed/i;

test("dev server renders pages without prerender errors or the error overlay", async ({ page }) => {
  for (const path of ROUTES) {
    const response = await page.goto(path);
    expect(response?.status(), `${path} status`).toBe(200);
    await expect(page.getByRole("heading", { level: 1 }).first()).toBeVisible();
    // Let streamed (Suspense) content and any dev overlay settle.
    await page.waitForLoadState("networkidle");
    await page.waitForTimeout(1000);

    // The Next.js error overlay is rendered into a <nextjs-portal> custom element.
    const overlay = page.locator("nextjs-portal").getByRole("dialog");
    await expect(overlay, `${path} shows the Next.js error overlay`).toHaveCount(0);
  }

  // The landing page badge is the streamed ApiStatus result (API is unreachable in this setup).
  await page.goto("/");
  await expect(page.locator('[data-testid="api-status"][data-status="offline"]')).toBeVisible();

  const log = readFileSync("test-results/dev-server.log", "utf8");
  const bad = log.split("\n").filter((line) => SERVER_ERROR.test(line));
  expect(bad, `dev server logged errors:\n${log}`).toEqual([]);
});
