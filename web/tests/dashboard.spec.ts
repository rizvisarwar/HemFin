import { expect, test, type Page, type TestInfo } from "@playwright/test";
import { seed, seedDashboard, seedHouseholds, signInAs, uniqueUser, type SeedDashboard } from "./support/auth";

// HEM-023: the dashboard in its four states, at 375, 768 and 1280 px (the three projects).
// Screenshots land in test-results/screenshots/hem024/<project>/<state>-<light|dark>.png.

test.describe.configure({ timeout: 120_000 });

const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

function iso(daysFromToday: number): string {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() + daysFromToday);
  return d.toISOString().slice(0, 10);
}

function thisMonth() {
  const now = new Date();
  return { key: now.toISOString().slice(0, 7), label: `${MONTHS[now.getUTCMonth()]} ${now.getUTCFullYear()}` };
}

const sek = (amount: string) => ({ amount, currency: "SEK" });

function populated(overrides: Partial<SeedDashboard> = {}): SeedDashboard {
  return {
    month: thisMonth().key,
    spent_this_month: sek("812.40"),
    recurring_monthly: sek("1043.00"),
    income_this_month: sek("2850.00"),
    upcoming: [
      { type: "notice_deadline", date: iso(5), contract_id: "11111111-1111-4111-8111-111111111111", contract_name: "Car insurance", amount: null },
      { type: "payment", date: iso(6), contract_id: "11111111-1111-4111-8111-111111111111", contract_name: "Car insurance", amount: sek("362.50") },
      { type: "renewal", date: iso(6), contract_id: "22222222-2222-4222-8222-222222222222", contract_name: "Music streaming with a rather long contract name that must wrap", amount: { amount: "11.99", currency: "USD" } },
      { type: "payment", date: iso(20), contract_id: "33333333-3333-4333-8333-333333333333", contract_name: "Gym", amount: sek("29.00") },
    ],
    has_records: true,
    ...overrides,
  };
}

async function snap(page: Page, info: TestInfo, name: string) {
  for (const scheme of ["light", "dark"] as const) {
    await page.emulateMedia({ colorScheme: scheme });
    await page.mouse.move(0, 0);
    await page.screenshot({
      path: `test-results/screenshots/hem024/${info.project.name}/${name}-${scheme}.png`,
      fullPage: true,
      animations: "disabled",
    });
  }
  await page.emulateMedia({ colorScheme: "light" });
}

/** No horizontal scroll, and every link and button in the page content is at least 44 px tall. */
async function checkLayout(page: Page) {
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(overflow).toBeLessThanOrEqual(0);
  const small = await page.evaluate(() => {
    const out: string[] = [];
    for (const el of document.querySelectorAll("main a, main button")) {
      const r = (el as HTMLElement).getBoundingClientRect();
      if (r.width === 0 || r.height === 0) continue;
      if (r.height < 43.5) out.push(`${el.textContent?.trim()} ${Math.round(r.height)}`);
    }
    return out;
  });
  expect(small).toEqual([]);
}

async function open(page: Page, context: Parameters<typeof signInAs>[0], info: TestInfo) {
  const me = uniqueUser(info);
  await seed(me, { display_name: "Alex Lee" });
  await signInAs(context, me);
  return me;
}

test.describe("dashboard", () => {
  test("populated", async ({ page, context }, info) => {
    const me = await open(page, context, info);
    await seedDashboard(me, { dashboard: populated() });
    await page.goto("/dashboard");
    await expect(page.getByTestId("dashboard")).toBeVisible();
    await expect(page.getByRole("heading", { level: 1, name: "Dashboard" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Add an expense" })).toBeVisible();
    await expect(page.getByText("812,40 kr")).toBeVisible();
    await expect(page.getByText("1 043,00 kr")).toBeVisible();
    await expect(page.getByText("a month", { exact: true })).toBeVisible();
    await expect(page.getByText("+2 850,00 kr")).toBeVisible();
    await expect(page.getByText(thisMonth().label, { exact: true })).toBeVisible();
    await expect(page.getByText(`Received in ${thisMonth().label}`)).toBeVisible();
    const events = page.getByTestId("upcoming-event");
    await expect(events).toHaveCount(4);
    await expect(events.nth(0)).toContainText("Notice deadline");
    await expect(events.nth(0)).toContainText("Notice deadline soon, in 5 days");
    await expect(events.nth(0)).not.toContainText("kr");
    await expect(events.nth(1)).toContainText("Due in 6 days");
    await expect(events.nth(1)).toContainText("362,50 kr");
    await expect(events.nth(2)).toContainText("Renews in 6 days");
    await expect(events.nth(2)).toContainText("11,99 USD"); // a row stored in another currency shows its own code
    await expect(events.nth(3)).not.toContainText("Due in"); // more than 7 days away: the date only
    await expect(page.getByRole("link", { name: "Gym" })).toHaveAttribute("href", "/contracts/33333333-3333-4333-8333-333333333333");
    await checkLayout(page);
    await snap(page, info, "populated");
  });

  test("first run", async ({ page, context }, info) => {
    await open(page, context, info);
    await page.goto("/dashboard");
    await expect(page.getByTestId("dashboard-first-run")).toBeVisible();
    await expect(page.getByTestId("first-run-privacy")).toHaveCount(0); // personal space
    await expect(page.getByRole("heading", { name: "Start with your bills" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Add a contract" })).toBeVisible();
    await expect(page.getByRole("link", { name: "Record an expense instead" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Add an expense" })).toHaveCount(0); // no header action (F17)
    await expect(page.getByText("0,00 kr")).toHaveCount(0); // no zero totals
    await checkLayout(page);
    await snap(page, info, "first-run");
  });

  test("records only in another month is not a first run", async ({ page, context }, info) => {
    const me = await open(page, context, info);
    await seedDashboard(me, {
      dashboard: populated({
        spent_this_month: sek("0.00"),
        recurring_monthly: sek("0.00"),
        income_this_month: sek("0.00"),
        upcoming: [],
        has_records: true,
      }),
    });
    await page.goto("/dashboard");
    await expect(page.getByTestId("dashboard")).toBeVisible();
    await expect(page.getByTestId("dashboard-first-run")).toHaveCount(0);
    await expect(page.getByText("No expenses this month yet. Record one to see it here.")).toBeVisible();
  });

  test("first run in a household shows the privacy line", async ({ page, context }, info) => {
    const me = await open(page, context, info);
    const { ids } = await seedHouseholds(me, [{ name: "The Lee family", role: "owner" }]);
    await context.addCookies([{ name: "hemfin-space", value: ids[0], url: "http://127.0.0.1:3100", httpOnly: true, sameSite: "Lax" }]);
    await page.goto("/dashboard");
    await expect(page.getByTestId("dashboard-first-run")).toBeVisible();
    await expect(page.getByText("Household members see only what the household shares.")).toBeVisible();
    await checkLayout(page);
    await snap(page, info, "first-run-household");
  });

  test("empty upcoming link is underlined; long names clamp to two lines", async ({ page, context }, info) => {
    const me = await open(page, context, info);
    await seedDashboard(me, { dashboard: populated({ upcoming: [] }) });
    await page.goto("/dashboard");
    const link = page.getByTestId("upcoming").getByRole("link", { name: "Add a contract" });
    await expect(link).toBeVisible();
    expect(await link.evaluate((el) => getComputedStyle(el).textDecorationLine)).toContain("underline");
    expect((await link.boundingBox())!.height).toBeGreaterThanOrEqual(43.5);

    const long = "Comprehensive household contents and liability insurance with a very long contract name that goes on and on and on and on and on and on and on";
    await seedDashboard(me, {
      dashboard: populated({
        upcoming: [{ type: "payment", date: iso(3), contract_id: "44444444-4444-4444-8444-444444444444", contract_name: long, amount: sek("9.00") }],
      }),
    });
    await page.reload();
    const name = page.getByTestId("upcoming-event").getByRole("link").locator("span");
    await expect(name).toBeVisible();
    const { h, lh } = await name.evaluate((el) => ({ h: el.getBoundingClientRect().height, lh: parseFloat(getComputedStyle(el).lineHeight) }));
    expect(h).toBeLessThanOrEqual(lh * 2 + 1);
    await checkLayout(page);
    await snap(page, info, "long-name");
  });

  test("partial: zero hints and empty upcoming", async ({ page, context }, info) => {
    const me = await open(page, context, info);
    await seedDashboard(me, {
      dashboard: populated({ spent_this_month: sek("0.00"), income_this_month: sek("0.00"), upcoming: [] }),
    });
    await page.goto("/dashboard");
    await expect(page.getByTestId("dashboard")).toBeVisible();
    await expect(page.getByText("No expenses this month yet. Record one to see it here.")).toBeVisible();
    await expect(page.getByText("No income this month yet. Record some to see it here.")).toBeVisible();
    await expect(page.getByRole("heading", { name: "Nothing due in 30 days" })).toBeVisible();
    await checkLayout(page);
    await snap(page, info, "partial");
  });

  test("error with retry", async ({ page, context }, info) => {
    const me = await open(page, context, info);
    await seedDashboard(me, { dashboard: populated(), fail: true });
    await page.goto("/dashboard");
    await expect(page.getByTestId("dashboard-error")).toContainText("We could not load your summary just now.");
    await expect(page.getByText("812,40 kr")).toHaveCount(0); // the totals are replaced by the error
    await checkLayout(page);
    await snap(page, info, "error");

    await seedDashboard(me, { fail: false });
    await page.getByRole("button", { name: "Retry" }).click();
    await expect(page.getByTestId("dashboard")).toBeVisible();
    await expect(page.getByText("812,40 kr")).toBeVisible();
  });
});
