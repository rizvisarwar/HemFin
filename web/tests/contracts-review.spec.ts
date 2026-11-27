import { expect, test, type BrowserContext, type Page, type TestInfo } from "@playwright/test";
import { failLists, isoIn, seed, seedContracts, seedHouseholds, selectSpace, signInAs, uniqueUser, userIdFor, type SeedContract } from "./support/auth";

// HEM-021 review round 1: races, the space switch on the detail page, focus, dates, the form header
// and error scrolling, announcements, and names that wait for their data.

const LEE = "The Lee family";
const isPhone = (page: Page) => (page.viewportSize()?.width ?? 1280) < 768;
const heading1 = (page: Page, name: string | RegExp) => page.getByRole("heading", { level: 1, name });
const dialogOf = (page: Page, name: string) => page.getByRole("dialog", { name });
const rowsOf = (page: Page) => page.getByTestId(isPhone(page) ? "contract-card" : "contract-row");

async function setup(context: BrowserContext, info: TestInfo, opts: { household?: boolean } = {}) {
  const me = uniqueUser(info);
  const base = me.email.replace("@example.test", "");
  const jordan = { email: `jordan.${base}@example.test`, display_name: "Jordan Kim" };
  await seed(me, { display_name: "Alex Lee" });
  const seeded = await seedHouseholds(me, opts.household ? [{ name: LEE, role: "owner", members: [jordan] }] : []);
  await signInAs(context, me);
  const spaceId = opts.household ? seeded.ids[0] : seeded.personal_id;
  if (opts.household) await selectSpace(context, spaceId);
  return { me, spaceId, personalId: seeded.personal_id, jordanId: await userIdFor(jordan) };
}

const CAR: SeedContract = {
  name: "Car insurance",
  category: "insurance.car",
  amount: "4350.00",
  frequency: "annual",
  schedule: { next_payment_date: isoIn(6), renewal_date: isoIn(35), notice_deadline: isoIn(5) },
};
const MUSIC: SeedContract = { name: "Music streaming", category: "subscription.streaming", amount: "11.99" };
const OLD: SeedContract = { name: "Cancelled one", category: "utility.internet", status: "cancelled" };

/** Sets a list filter: in the row from md up, in the sheet on phone. */
async function setFilter(page: Page, label: string, value: string) {
  if (isPhone(page)) {
    await page.getByTestId("filters-button").click();
    const sheet = page.getByRole("dialog", { name: "Filters" });
    await sheet.getByLabel(label).selectOption(value);
    await sheet.getByRole("button", { name: "Show contracts" }).click();
    await expect(sheet).toHaveCount(0);
  } else {
    await page.getByTestId("filter-row").getByLabel(label).selectOption(value);
  }
}

test.describe.configure({ timeout: 120_000 });

test("a page requested before a filter change is dropped, not appended to the new list", async ({ page, context }, info) => {
  const { spaceId } = await setup(context, info);
  await seedContracts(spaceId, [
    ...Array.from({ length: 27 }, (_, i) => ({ name: `Contract ${String(i + 1).padStart(2, "0")}`, category: "other" })),
    OLD,
  ]);
  await page.goto("/contracts");
  const rows = rowsOf(page);
  await expect(rows).toHaveCount(25);
  let release: () => void = () => {};
  const gate = new Promise<void>((resolve) => (release = resolve));
  await page.route(
    (url) => url.pathname.endsWith("/contracts") && url.searchParams.has("cursor"),
    async (route) => {
      await gate;
      await route.continue();
    },
  );
  const held = page.waitForResponse((r) => r.url().includes("cursor="));
  await page.getByRole("button", { name: "Show more contracts" }).click();
  await setFilter(page, "Status", "cancelled");
  await expect(rows).toHaveCount(1);
  release();
  await held;
  await page.evaluate(() => new Promise((resolve) => setTimeout(resolve, 300)));
  await expect(rows).toHaveCount(1);
  await expect(rows).toContainText("Cancelled one");
  await expect(page.getByRole("button", { name: /Show more contracts|Loading/ })).toHaveCount(0);
});

test("on the detail page the old contract never shows after a space switch", async ({ page, context }, info) => {
  const { spaceId, personalId } = await setup(context, info, { household: true });
  const { ids } = await seedContracts(spaceId, [CAR]);
  await seedContracts(personalId, [MUSIC]);
  await page.goto(`/contracts/${ids[0]}`);
  await expect(heading1(page, "Car insurance")).toBeVisible();
  await page.evaluate(() => {
    const w = window as unknown as { __flash: boolean };
    w.__flash = false;
    new MutationObserver(() => {
      const space = document.querySelector("header[data-space]")?.getAttribute("data-space");
      if (space === "personal" && document.querySelector("h1")?.textContent === "Car insurance") w.__flash = true;
    }).observe(document, { subtree: true, childList: true, attributes: true, characterData: true });
  });
  await page.getByRole("button", { name: /^Active space/ }).click();
  await page.getByRole("menuitemradio", { name: /Personal/ }).click();
  await expect(page).toHaveURL(/\/contracts$/);
  await expect(page.getByRole("link", { name: /Music streaming/ })).toBeVisible();
  expect(await page.evaluate(() => (window as unknown as { __flash: boolean }).__flash)).toBe(false);
});

test("dates read day, month, year", async ({ page, context }, info) => {
  const { spaceId } = await setup(context, info);
  const { ids } = await seedContracts(spaceId, [
    { ...CAR, start_date: "2026-01-05", schedule: { next_payment_date: "2099-12-03", renewal_date: "2099-01-01", notice_deadline: null } },
  ]);
  await page.goto("/contracts");
  await expect(rowsOf(page)).toContainText(isPhone(page) ? "Renews 1 Jan 2099" : "3 Dec 2099");
  await page.goto(`/contracts/${ids[0]}`);
  await expect(page.getByTestId("schedule-card")).toContainText("3 Dec 2099");
  await expect(page.getByTestId("details-card")).toContainText("5 Jan 2026");
});

test("the space badge is in the form header at every width, under the title; the close icon is 44 px", async ({ page, context }, info) => {
  await setup(context, info, { household: true });
  await page.goto("/contracts?new=1");
  const dlg = dialogOf(page, "Add a contract");
  await expect(dlg).toBeVisible();
  const badge = dlg.locator("[data-space]");
  await expect(badge).toHaveAttribute("data-space", "household");
  await expect(badge).toContainText(LEE);
  // One snapshot of all the boxes, so a dialog still sliding in cannot skew the comparison.
  const box = await dlg.evaluate((el) => {
    const r = (e: Element | null) => e!.getBoundingClientRect();
    const title = el.querySelector('[id][class*="text-h3"]') ?? el.querySelector("h2");
    return {
      title: r(title),
      badge: r(el.querySelector("[data-space]")),
      body: r(el.querySelector("[data-dialog-scroll]")),
      close: r(el.querySelector("button:has(.sr-only)")),
    };
  });
  expect(box.badge.top).toBeGreaterThanOrEqual(box.title.bottom - 1);
  expect(box.badge.bottom).toBeLessThanOrEqual(box.body.top + 1); // in the header, above the scrolling body
  expect(box.close.width).toBeGreaterThanOrEqual(44);
  expect(box.close.height).toBeGreaterThanOrEqual(44);
});

test("a server error is scrolled into view above the footer", async ({ page, context }, info) => {
  await setup(context, info);
  await page.goto("/contracts?new=1");
  const dlg = dialogOf(page, "Add a contract");
  await expect(dlg).toBeVisible();
  await dlg.getByLabel("Name", { exact: true }).fill("Electricity");
  await dlg.getByLabel("Category").selectOption({ label: "Electricity" });
  await dlg.getByLabel("Amount").fill("89.90");
  await dlg.getByLabel("Currency").selectOption("AED");
  await dlg.getByRole("button", { name: "Save contract" }).click();
  const message = dlg.getByText("Unsupported currency.");
  await expect(message).toBeVisible();
  const footer = await dlg.getByRole("button", { name: "Save contract" }).boundingBox();
  const m = await message.boundingBox();
  expect(m!.y + m!.height).toBeLessThanOrEqual(footer!.y);
  await expect(message).toBeInViewport({ ratio: 1 });
});

test("the result count is announced politely, and the dismiss button of a confirmation shows its focus ring", async ({ page, context }, info) => {
  const { spaceId } = await setup(context, info);
  const { ids } = await seedContracts(spaceId, [CAR, OLD]);
  await page.goto("/contracts");
  await expect(page.getByTestId("result-count")).toHaveText("1 contract shown");
  await expect(page.getByTestId("result-count")).toHaveAttribute("aria-live", "polite");
  await setFilter(page, "Status", "all");
  await expect(page.getByTestId("result-count")).toHaveText("2 contracts shown");

  await page.goto(`/contracts/${ids[0]}`);
  await expect(heading1(page, "Car insurance")).toBeVisible();
  await page.getByRole("button", { name: "More actions" }).click();
  await page.getByRole("menuitem", { name: "Delete contract" }).click();
  const keep = page.getByRole("alertdialog").getByRole("button", { name: "Keep contract" });
  await expect(keep).toBeFocused();
  const outline = await keep.evaluate((el) => {
    const cs = getComputedStyle(el);
    return { style: cs.outlineStyle, width: parseFloat(cs.outlineWidth) };
  });
  expect(outline.style).not.toBe("none");
  expect(outline.width).toBeGreaterThanOrEqual(2);
});

test("the member and the category name stay hidden until they are loaded, never a fallback", async ({ page, context }, info) => {
  const { me, spaceId, jordanId } = await setup(context, info, { household: true });
  await seedContracts(spaceId, [{ ...MUSIC, member_user_id: jordanId }]);
  await failLists(me, { delay_ms: 0 });
  await page.route("**/api/v1/spaces/*/members*", async (route) => {
    await new Promise((resolve) => setTimeout(resolve, 1500));
    await route.continue();
  });
  await page.goto("/contracts");
  const rows = rowsOf(page);
  await expect(rows).toContainText("Music streaming");
  await expect(rows).not.toContainText("For Member");
  await expect(rows).not.toContainText("subscription.streaming");
  await expect(rows).toContainText("For Jordan Kim", { timeout: 15_000 });
});
