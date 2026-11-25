import { expect, test, type Page, type TestInfo } from "@playwright/test";

const APP_ROUTES = [
  { path: "/dashboard", h1: "Dashboard" },
  { path: "/notifications", h1: "Notifications" },
  { path: "/contracts", h1: "Contracts" },
  { path: "/expenses", h1: "Expenses" },
  { path: "/income", h1: "Income" },
  { path: "/reports", h1: "Reports" },
  { path: "/documents", h1: "Documents" },
  { path: "/suggestions", h1: "Suggestions" },
  { path: "/assistant", h1: "Assistant" },
  { path: "/household", h1: "Household" },
  { path: "/profile", h1: "Profile" },
];

async function expectNoHorizontalScroll(page: Page) {
  const { scrollWidth, clientWidth } = await page.evaluate(() => ({
    scrollWidth: document.documentElement.scrollWidth,
    clientWidth: document.documentElement.clientWidth,
  }));
  expect(scrollWidth).toBeLessThanOrEqual(clientWidth);
}

async function shot(page: Page, info: TestInfo, name: string) {
  await page.screenshot({
    path: `test-results/screenshots/${info.project.name}-${name}.png`,
    fullPage: true,
  });
}

test.describe("public pages", () => {
  test("landing page renders and tolerates an unreachable API", async ({ page }, info) => {
    await page.goto("/");
    await expect(page.getByRole("heading", { level: 1 })).toContainText("Household finances, calm and in one place.");
    // The streamed result replaces the "checking" fallback, so wait for the final state.
    const badge = page.locator('[data-testid="api-status"][data-status="offline"]');
    await expect(badge).toBeVisible();
    await expect(badge).toContainText("API status: offline");
    await expectNoHorizontalScroll(page);
    await shot(page, info, "landing");
  });

  test("sign-in placeholder renders", async ({ page }, info) => {
    await page.goto("/sign-in");
    await expect(page.getByRole("heading", { level: 1, name: "Sign in" })).toBeVisible();
    await expect(page.getByLabel("Email")).toHaveAttribute("autocomplete", "email");
    await expect(page.getByLabel("Password")).toHaveAttribute("autocomplete", "current-password");
    await expectNoHorizontalScroll(page);
    await shot(page, info, "sign-in");
  });
});

test.describe("app shell", () => {
  test("navigation chrome matches the breakpoint", async ({ page }, info) => {
    await page.goto("/dashboard");
    const bottomNav = page.getByTestId("bottom-nav");
    const sideNav = page.getByTestId("side-nav");

    if (info.project.name === "phone") {
      await expect(bottomNav).toBeVisible();
      await expect(sideNav).toBeHidden();
      // Tap targets are at least 44 px.
      for (const link of await bottomNav.getByRole("link").all()) {
        const box = await link.boundingBox();
        expect(box?.width).toBeGreaterThanOrEqual(44);
        expect(box?.height).toBeGreaterThanOrEqual(44);
      }
    } else {
      await expect(bottomNav).toBeHidden();
      await expect(sideNav).toBeVisible();
      const box = await sideNav.boundingBox();
      if (info.project.name === "tablet") {
        expect(box?.width).toBe(72); // icon rail
        await expect(sideNav.getByText("Overview")).toBeHidden();
      } else {
        expect(box?.width).toBe(256); // expanded sidebar
        await expect(sideNav.getByText("Overview")).toBeVisible();
        await expect(sideNav.getByRole("link", { name: "Dashboard" })).toHaveAttribute("aria-current", "page");
      }
    }
    await expectNoHorizontalScroll(page);
    await shot(page, info, "dashboard");
  });

  test("every nav destination renders an empty state without horizontal scroll", async ({ page }) => {
    for (const route of APP_ROUTES) {
      await page.goto(route.path);
      await expect(page.getByRole("heading", { level: 1, name: route.h1 })).toBeVisible();
      await expect(page.locator("[data-slot=empty-state]").first()).toBeVisible();
      await expectNoHorizontalScroll(page);
    }
  });

  test("can navigate with the visible navigation", async ({ page }, info) => {
    await page.goto("/dashboard");
    if (info.project.name === "phone") {
      await page.getByTestId("bottom-nav").getByRole("link", { name: "Contracts" }).click();
      await expect(page).toHaveURL(/\/contracts$/);
      await page.getByTestId("bottom-nav").getByRole("button", { name: "More" }).click();
      await shot(page, info, "more-sheet");
      await page.getByRole("dialog").getByRole("link", { name: "Expenses" }).click();
      await expect(page).toHaveURL(/\/expenses$/);
    } else {
      await page.getByTestId("side-nav").getByRole("link", { name: "Contracts" }).click();
      await expect(page).toHaveURL(/\/contracts$/);
      await page.getByTestId("side-nav").getByRole("link", { name: "Expenses" }).click();
      await expect(page).toHaveURL(/\/expenses$/);
    }
    await expect(page.getByRole("heading", { level: 1, name: "Expenses" })).toBeVisible();
  });

  test("space switcher changes the active space and stores it in the cookie", async ({ page, context }, info) => {
    await page.goto("/dashboard");
    const header = page.locator("header[data-space]").first();
    await expect(header).toHaveAttribute("data-space", "personal");

    await page.getByRole("button", { name: /Active space: Personal/ }).click();
    await shot(page, info, "space-switcher-open");
    const phone = info.project.name === "phone";
    await page.getByRole(phone ? "radio" : "menuitemradio", { name: /Sample household/ }).click();

    await expect(header).toHaveAttribute("data-space", "household");
    await expect(page.getByRole("button", { name: /Active space: Sample household/ })).toBeVisible();
    await expect.poll(async () => (await context.cookies()).find((c) => c.name === "hemfin-space")?.value).toBe(
      "sample-household",
    );

    // The server renders the stored space first time.
    await page.reload();
    await expect(page.locator("header[data-space]").first()).toHaveAttribute("data-space", "household");
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
    await shot(page, info, "household-space");
  });
});
