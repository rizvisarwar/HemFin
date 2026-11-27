import { expect, test, type BrowserContext, type Locator, type Page, type TestInfo } from "@playwright/test";
import {
  refuseSaves,
  failContracts,
  failLists,
  isoIn,
  removeFromHousehold,
  seed,
  seedContracts,
  seedHouseholds,
  selectSpace,
  signInAs,
  storedContracts,
  uniqueUser,
  userIdFor,
  type SeedContract,
} from "./support/auth";

// HEM-021: the contracts list, detail and form (docs/design/finance.md section 4), against the mock
// backend (tests/support/mock-backend.mjs). Each test signs in as its own user and seeds its own
// spaces and contracts, so parallel tests never share state. Screenshots of every state land in
// test-results/screenshots/hem024/<project>/<state>-<light|dark>.png (phone 375, tablet 768,
// desktop 1280).

const LEE = "The Lee family";

async function snap(page: Page, info: TestInfo, name: string, opts: { view?: boolean } = {}) {
  // Buttons stay disabled until the page has hydrated, and look dimmed: wait for that to pass.
  await page.waitForFunction(() => document.querySelectorAll("button:disabled").length === 0, null, { timeout: 3000 }).catch(() => {});
  for (const scheme of ["light", "dark"] as const) {
    await page.emulateMedia({ colorScheme: scheme });
    if (scheme === "dark") await expect(page.locator("html")).toHaveClass(/dark/);
    else await expect(page.locator("html")).not.toHaveClass(/dark/);
    await page.mouse.move(0, 0); // no control captured in its hover state
    await page.screenshot({
      path: `test-results/screenshots/hem024/${info.project.name}/${name}-${scheme}.png`,
      fullPage: !opts.view,
      animations: "disabled",
    });
  }
  await page.emulateMedia({ colorScheme: "light" });
}

async function expectNoHorizontalScroll(page: Page) {
  const { scrollWidth, clientWidth } = await page.evaluate(() => ({
    scrollWidth: document.documentElement.scrollWidth,
    clientWidth: document.documentElement.clientWidth,
  }));
  expect(scrollWidth).toBeLessThanOrEqual(clientWidth);
}

/** Every visible link, button and form control inside `scope` is at least 44 px tall. */
async function expectAllTapTargets(scope: Locator) {
  const targets = await scope.locator("a[href], button, input:not([type=hidden]):not([type=checkbox]), select, textarea").all();
  for (const t of targets) {
    if (!(await t.isVisible())) continue;
    const box = await t.boundingBox();
    const label = (await t.innerText().catch(() => "")) || (await t.getAttribute("aria-label")) || (await t.getAttribute("id")) || "control";
    expect(box!.height, `"${label.slice(0, 40)}" height`).toBeGreaterThanOrEqual(44);
  }
}

const isPhone = (page: Page) => (page.viewportSize()?.width ?? 1280) < 768;
const heading1 = (page: Page, name: string | RegExp) => page.getByRole("heading", { level: 1, name });

function cast(info: TestInfo) {
  const me = uniqueUser(info);
  const base = me.email.replace("@example.test", "");
  return { me, jordan: { email: `jordan.${base}@example.test`, display_name: "Jordan Kim" } };
}

/** Signs in as the test's own user (Alex Lee). With `household`, the household is the active space. */
async function setup(context: BrowserContext, info: TestInfo, opts: { household?: boolean } = {}) {
  const { me, jordan } = cast(info);
  await seed(me, { display_name: "Alex Lee" });
  const seeded = await seedHouseholds(me, opts.household ? [{ name: LEE, role: "owner", members: [jordan] }] : []);
  await signInAs(context, me);
  const spaceId = opts.household ? seeded.ids[0] : seeded.personal_id;
  if (opts.household) await selectSpace(context, spaceId);
  return { me, jordan, spaceId, personalId: seeded.personal_id, jordanId: await userIdFor(jordan) };
}

const CAR: SeedContract = {
  name: "Car insurance",
  category: "insurance.car",
  provider: "Harbor Insurance",
  amount: "4350.00",
  frequency: "annual",
  start_date: "2026-01-01",
  auto_renew: true,
  renewal_term_months: 12,
  notice_period_days: 30,
  notes: "Policy ends at renewal.",
  schedule: { next_payment_date: isoIn(6), renewal_date: isoIn(35), notice_deadline: isoIn(5) },
};
const MUSIC: SeedContract = {
  name: "Music streaming",
  category: "subscription.streaming",
  provider: "Lark Audio",
  amount: "11.99",
  frequency: "monthly",
  schedule: { next_payment_date: isoIn(20), renewal_date: isoIn(6), notice_deadline: null },
};
const GYM: SeedContract = {
  name: "Gym",
  category: "membership.gym",
  amount: "540.00",
  currency: "SEK",
  frequency: "quarterly",
  schedule: { next_payment_date: isoIn(40), renewal_date: null, notice_deadline: null },
};
const OLD: SeedContract = { name: "Old phone plan", category: "utility.internet", status: "cancelled", amount: "20.00", schedule: { next_payment_date: null, renewal_date: null, notice_deadline: null } };

test.describe.configure({ timeout: 120_000 });

test.describe("contracts list", () => {
  test("cards on phone, table from md, schedule chips, money and no overflow", async ({ page, context }, info) => {
    const { spaceId } = await setup(context, info);
    await seedContracts(spaceId, [CAR, MUSIC, GYM]);
    await page.goto("/contracts");
    await expect(heading1(page, "Contracts")).toBeVisible();
    const rows = page.getByTestId(isPhone(page) ? "contract-card" : "contract-row");
    await expect(rows).toHaveCount(3);

    // Amounts are formatted from the decimal string, with the frequency in words; another currency shows its code.
    const car = rows.filter({ hasText: "Car insurance" });
    await expect(car).toContainText("4 350,00 kr");
    await expect(car).toContainText("a year");
    await expect(car).toContainText("Due in 6 days");
    await expect(rows.filter({ hasText: "Gym" })).toContainText("540,00 kr");
    await expect(rows.filter({ hasText: "Gym" })).toContainText("every 3 months");
    await expect(rows.filter({ hasText: "Gym" })).not.toContainText("Due");
    // The notice chip and the renewal chip sit in the renewal column (xl) or the card.
    if ((page.viewportSize()?.width ?? 0) !== 768) {
      await expect(car).toContainText("Notice deadline soon, in 5 days");
      await expect(rows.filter({ hasText: "Music streaming" })).toContainText("Renews in 6 days");
    }
    await expect(page.getByRole("link", { name: /Car insurance/ })).toHaveAttribute("href", /\/contracts\/[0-9a-f-]+$/);
    await expectNoHorizontalScroll(page);
    await expectAllTapTargets(page.locator("main"));
    await snap(page, info, "list-populated");
  });

  test("the default filter shows active contracts only; Status switches to cancelled and all", async ({ page, context }, info) => {
    const { spaceId } = await setup(context, info);
    await seedContracts(spaceId, [CAR, OLD]);
    await page.goto("/contracts");
    const rows = page.getByTestId(isPhone(page) ? "contract-card" : "contract-row");
    await expect(rows).toHaveCount(1);
    await expect(rows).toContainText("Car insurance");
    await setFilter(page, "Status", "cancelled");
    await expect(rows).toHaveCount(1);
    await expect(rows).toContainText("Old phone plan");
    await setFilter(page, "Status", "all");
    await expect(rows).toHaveCount(2);
  });

  test("Category filters by group and by one category", async ({ page, context }, info) => {
    const { spaceId } = await setup(context, info);
    await seedContracts(spaceId, [CAR, { ...CAR, name: "Home insurance", category: "insurance.home" }, MUSIC]);
    await page.goto("/contracts");
    const rows = page.getByTestId(isPhone(page) ? "contract-card" : "contract-row");
    await expect(rows).toHaveCount(3);
    await setFilter(page, "Category", "insurance"); // "All insurance"
    await expect(rows).toHaveCount(2);
    await setFilter(page, "Category", "insurance.car");
    await expect(rows).toHaveCount(1);
    await expect(rows).toContainText("Car insurance");
    await setFilter(page, "Category", "subscription.software");
    await expect(page.getByTestId("no-match")).toBeVisible();
    await expect(page.getByRole("heading", { name: "No matching contracts" })).toBeVisible();
    await snap(page, info, "list-no-match");
    await page.getByRole("button", { name: "Clear filters" }).click();
    await expect(rows).toHaveCount(3);
  });

  test("Applies to: All, Whole household and each member (household only)", async ({ page, context }, info) => {
    const { spaceId, jordanId } = await setup(context, info, { household: true });
    await seedContracts(spaceId, [
      { ...CAR, member_user_id: null },
      { ...MUSIC, member_user_id: jordanId },
      { ...GYM, member_user_id: null },
    ]);
    await page.goto("/contracts");
    const rows = page.getByTestId(isPhone(page) ? "contract-card" : "contract-row");
    await expect(rows).toHaveCount(3);
    await expect(rows.filter({ hasText: "Music streaming" })).toContainText("For Jordan Kim");
    await expect(rows.filter({ hasText: "Car insurance" })).not.toContainText("For ");
    await setFilter(page, "Applies to", "household");
    await expect(rows).toHaveCount(2);
    await expect(rows.filter({ hasText: "Music streaming" })).toHaveCount(0);
    await setFilter(page, "Applies to", jordanId);
    await expect(rows).toHaveCount(1);
    await expect(rows).toContainText("Music streaming");
    await setFilter(page, "Applies to", "all");
    await expect(rows).toHaveCount(3);
    await snap(page, info, "list-household");
  });

  test("a personal space has no Applies to filter", async ({ page, context }, info) => {
    await setup(context, info);
    await page.goto("/contracts");
    await expect(page.getByTestId("add-contract").or(page.getByRole("button", { name: "Add a contract" })).first()).toBeVisible();
    await expect(page.getByLabel("Applies to")).toHaveCount(0);
  });

  test("Show more contracts loads the next page", async ({ page, context }, info) => {
    const { spaceId } = await setup(context, info);
    await seedContracts(
      spaceId,
      Array.from({ length: 27 }, (_, i) => ({ name: `Contract ${String(i + 1).padStart(2, "0")}`, category: "other" })),
    );
    await page.goto("/contracts");
    const rows = page.getByTestId(isPhone(page) ? "contract-card" : "contract-row");
    await expect(rows).toHaveCount(25);
    const more = page.getByRole("button", { name: "Show more contracts" });
    await more.click();
    await expect(rows).toHaveCount(27);
    await expect(more).toHaveCount(0);
  });

  test("empty: one add button, in the empty state and not in the header", async ({ page, context }, info) => {
    await setup(context, info);
    await page.goto("/contracts");
    await expect(page.getByRole("heading", { name: "No contracts yet" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Add a contract" })).toHaveCount(1);
    await expect(page.getByTestId("add-contract")).toHaveCount(0);
    await expectNoHorizontalScroll(page);
    await snap(page, info, "list-empty");
    await page.getByRole("button", { name: "Add a contract" }).click();
    await expect(page.getByRole("dialog", { name: "Add a contract" })).toBeVisible();
  });

  test("loading skeleton, then an error with Retry", async ({ page, context }, info) => {
    const { me, spaceId } = await setup(context, info);
    await seedContracts(spaceId, [CAR]);
    await failLists(me, { delay_ms: 4000 });
    await page.goto("/contracts");
    await expect(page.getByTestId("contracts-loading")).toBeVisible();
    await snap(page, info, "list-loading", { view: true });
    await failLists(me, { delay_ms: 0 });
    await expect(page.getByTestId("contracts-list")).toBeVisible({ timeout: 15_000 });

    await failContracts(me, { list: true });
    await page.reload();
    await expect(page.getByTestId("contracts-error")).toContainText("We could not load your contracts just now.");
    await snap(page, info, "list-error");
    await failContracts(me, { list: false });
    await page.getByRole("button", { name: "Retry" }).click();
    await expect(page.getByTestId("contracts-list")).toBeVisible();
  });

  test("switching space reloads the data for the new space", async ({ page, context }, info) => {
    const { spaceId, personalId } = await setup(context, info, { household: true });
    await seedContracts(personalId, [{ ...MUSIC, name: "Personal streaming" }]);
    await seedContracts(spaceId, [CAR]);
    await page.goto("/contracts");
    const rows = page.getByTestId(isPhone(page) ? "contract-card" : "contract-row");
    await expect(rows).toContainText("Car insurance");
    await page.getByRole("button", { name: /^Active space/ }).click();
    await page.getByRole("menuitemradio", { name: /Personal/ }).click();
    await expect(rows).toContainText("Personal streaming");
    await expect(rows).toHaveCount(1);
    await expect(page.locator("header[data-space]").first()).toHaveAttribute("data-space", "personal");
  });

  test("the filter sheet on phone: count in the button, Clear filters, Show contracts", async ({ page, context }, info) => {
    test.skip(!isPhone(page), "The filter sheet is the phone layout");
    const { spaceId } = await setup(context, info);
    await seedContracts(spaceId, [CAR, OLD]);
    await page.goto("/contracts");
    const button = page.getByTestId("filters-button");
    await expect(button).toHaveText("Filters: Active");
    await button.click();
    const sheet = page.getByRole("dialog", { name: "Filters" });
    await sheet.getByLabel("Status").selectOption("all");
    await sheet.getByLabel("Category").selectOption("insurance.car");
    await snap(page, info, "filter-sheet", { view: true });
    await expectAllTapTargets(sheet);
    await sheet.getByRole("button", { name: "Show contracts" }).click();
    await expect(button).toHaveText("Filters: All, 1 more");
    await button.click();
    await sheet.getByRole("button", { name: "Clear filters" }).click();
    await sheet.getByRole("button", { name: "Show contracts" }).click();
    await expect(button).toHaveText("Filters: Active");
  });
});

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

const dialogOf = (page: Page, name: string) => page.getByRole("dialog", { name });
const toastText = (page: Page) => page.getByTestId("toast");

test.describe("create a contract", () => {
  async function fillValid(dlg: Locator) {
    await dlg.getByLabel("Name", { exact: true }).fill("Electricity");
    await dlg.getByLabel("Provider (optional)").fill("Volt Energy");
    await dlg.getByLabel("Category").selectOption({ label: "Electricity" });
    await dlg.getByLabel("Amount").fill("89,90");
    await dlg.getByLabel("Billed").selectOption("monthly");
    await dlg.getByLabel("Starts").fill("2026-12-01");
    await dlg.getByLabel("Notice period (days, optional)").fill("30");
    await dlg.getByLabel("Notes (optional)").fill("Variable rate.");
  }

  test("fills the form, saves, shows the contract and a toast; the amount goes to the API as a string", async ({ page, context }, info) => {
    const { spaceId } = await setup(context, info);
    await seedContracts(spaceId, [CAR]);
    await page.goto("/contracts");
    await page.getByTestId("add-contract").click();
    const dlg = dialogOf(page, "Add a contract");
    await expect(dlg).toBeVisible();
    await expect(dlg.getByLabel("Name", { exact: true })).toBeFocused();
    await expect(dlg.getByLabel("Currency")).toHaveCount(0); // SEK only: no currency field
    await expect(dlg.getByLabel("Billed")).toHaveValue("monthly");
    await expect(dlg.getByLabel("Applies to (optional)")).toHaveCount(0); // personal space
    await snap(page, info, "form-empty", { view: true });

    await fillValid(dlg);
    await snap(page, info, "form-filled", { view: true });
    await dlg.getByRole("button", { name: "Save contract" }).click();
    await expect(dlg).toHaveCount(0);
    await expect(toastText(page)).toContainText("Contract saved");
    await expect(page.getByText("Contract saved.")).toBeVisible();
    const rows = page.getByTestId(isPhone(page) ? "contract-card" : "contract-row");
    await expect(rows).toHaveCount(2);
    await expect(rows.filter({ hasText: "Electricity" })).toContainText("89,90 kr");

    const saved = (await storedContracts(spaceId)).find((c) => c.name === "Electricity");
    expect(saved).toMatchObject({
      amount: "89.90",
      currency: "SEK",
      frequency: "monthly",
      provider: "Volt Energy",
      notice_period_days: 30,
      auto_renew: false,
      renewal_term_months: null,
      member_user_id: null,
      notes: "Variable rate.",
      category: "utility.electricity",
    });
  });

  test("a household form offers Applies to with names, never emails", async ({ page, context }, info) => {
    const { spaceId, jordanId, jordan } = await setup(context, info, { household: true });
    await page.goto("/contracts?new=1");
    const dlg = dialogOf(page, "Add a contract");
    await expect(dlg).toBeVisible(); // ?new=1 opens it
    const applies = dlg.getByLabel("Applies to (optional)");
    await expect(applies.locator("option")).toHaveText(["Whole household", "Alex Lee", "Jordan Kim"]);
    await expect(dlg.getByText(jordan.email)).toHaveCount(0);
    await dlg.getByLabel("Name", { exact: true }).fill("Violin lessons");
    await dlg.getByLabel("Category").selectOption({ label: "Kids" });
    await dlg.getByLabel("Amount").fill("45");
    await applies.selectOption(jordanId);
    await dlg.getByRole("button", { name: "Save contract" }).click();
    await expect(dlg).toHaveCount(0);
    await expect(page).toHaveURL(/\/contracts$/); // ?new=1 is removed
    const saved = (await storedContracts(spaceId)).find((c) => c.name === "Violin lessons");
    expect(saved?.member_user_id).toBe(jordanId);
  });

  test("client validation: messages under the fields, focus on the first, no request sent", async ({ page, context }, info) => {
    const { spaceId } = await setup(context, info);
    await page.goto("/contracts?new=1");
    const dlg = dialogOf(page, "Add a contract");
    await expect(dlg).toBeVisible();
    await dlg.getByRole("button", { name: "Save contract" }).click();
    await expect(dlg.getByText("Enter a name for the contract.")).toBeVisible();
    await expect(dlg.getByText("Choose a category.")).toBeVisible();
    await expect(dlg.getByText("Enter the amount.")).toBeVisible();
    await expect(dlg.getByLabel("Name", { exact: true })).toBeFocused();
    await expect(dlg.getByLabel("Name", { exact: true })).toHaveAttribute("aria-invalid", "true");
    await snap(page, info, "form-validation", { view: true });

    // The amount rules of finance.md 3.1: a decimal comma or dot, at most 2 decimals.
    const amount = dlg.getByLabel("Amount");
    for (const [typed, message] of [
      ["12,5,0", "Use a comma before the öre, like 12,50."],
      ["abc", "Use a comma before the öre, like 12,50."],
      ["0", "Enter an amount greater than 0."],
      ["1,234", "Use at most 2 decimals (öre)."],
    ] as const) {
      await amount.fill(typed);
      await amount.blur();
      await expect(dlg.getByText(message)).toBeVisible();
    }
    await amount.fill("1 234,50");
    await amount.blur();
    await expect(dlg.locator("#amount-error")).toHaveText("");

    await dlg.getByLabel("Starts").fill("2026-12-01");
    await dlg.getByLabel("Ends (optional)").fill("2026-11-01");
    await dlg.getByLabel("Ends (optional)").blur();
    await expect(dlg.getByText("The end date must be on or after the start date.")).toBeVisible();

    await dlg.getByLabel("Renews automatically").check();
    await dlg.getByLabel("Renews every (months)").fill("121");
    await dlg.getByLabel("Renews every (months)").blur();
    await expect(dlg.getByText("Enter a whole number of months, from 1 to 120.")).toBeVisible();
    await dlg.getByLabel("Notice period (days, optional)").fill("1.5");
    await dlg.getByLabel("Notice period (days, optional)").blur();
    await expect(dlg.getByText("Enter a whole number of days, for example 30.")).toBeVisible();
    expect(await storedContracts(spaceId)).toHaveLength(0);
  });

  test("server validation errors land under their fields and the values stay", async ({ page, context }, info) => {
    const { spaceId } = await setup(context, info);
    await page.goto("/contracts?new=1");
    const dlg = dialogOf(page, "Add a contract");
    await expect(dlg).toBeVisible();
    await fillValid(dlg);
    // The API refuses the amount: the message goes under the amount field and the values stay.
    const unroute = await refuseSaves(page, "**/api/v1/spaces/*/contracts", "amount", "Amount is too large.");
    await dlg.getByRole("button", { name: "Save contract" }).click();
    await expect(dlg.getByText("Amount is too large.")).toBeVisible();
    await expect(dlg.getByLabel("Amount")).toHaveAttribute("aria-invalid", "true");
    await expect(dlg.getByLabel("Amount")).toBeFocused();
    await expect(dlg.getByLabel("Name", { exact: true })).toHaveValue("Electricity");
    await expect(dlg.getByLabel("Amount")).toHaveValue("89,90");
    await snap(page, info, "form-server-error", { view: true });
    expect(await storedContracts(spaceId)).toHaveLength(0);
    // Fix it and save.
    await unroute();
    await dlg.getByRole("button", { name: "Save contract" }).click();
    await expect(dlg).toHaveCount(0);
    expect((await storedContracts(spaceId))[0]).toMatchObject({ currency: "SEK", amount: "89.90" });
  });

  test("a server refusal with no field and a lost connection show a message at the top; values stay", async ({ page, context }, info) => {
    const { me, spaceId } = await setup(context, info);
    await page.goto("/contracts?new=1");
    const dlg = dialogOf(page, "Add a contract");
    await expect(dlg).toBeVisible();
    await fillValid(dlg);
    await failContracts(me, { save: true });
    await dlg.getByRole("button", { name: "Save contract" }).click();
    await expect(dlg.getByTestId("form-message").getByText("Something went wrong. Try again in a moment.")).toBeVisible();
    await failContracts(me, { save: false });

    await page.route("**/api/v1/spaces/*/contracts", (route) => route.abort());
    await dlg.getByRole("button", { name: "Save contract" }).click();
    await expect(dlg.getByText("We could not reach the server. Check your connection and try again.")).toBeVisible();
    await expect(dlg.getByLabel("Name", { exact: true })).toHaveValue("Electricity");
    await page.unroute("**/api/v1/spaces/*/contracts");
    await dlg.getByRole("button", { name: "Save contract" }).click();
    await expect(dlg).toHaveCount(0);
    expect(await storedContracts(spaceId)).toHaveLength(1);
  });

  test("unsaved changes ask before closing; a clean form closes at once", async ({ page, context }, info) => {
    await setup(context, info);
    await page.goto("/contracts?new=1");
    const dlg = dialogOf(page, "Add a contract");
    await expect(dlg).toBeVisible();
    await dlg.getByRole("button", { name: "Cancel" }).click(); // clean: closes at once
    await expect(dlg).toHaveCount(0);

    await page.getByRole("button", { name: "Add a contract" }).click();
    await expect(dlg).toBeVisible();
    await dlg.getByLabel("Name", { exact: true }).fill("Half done");
    await page.keyboard.press("Escape");
    const alert = page.getByRole("alertdialog", { name: "Discard changes?" });
    await expect(alert).toContainText("Your changes to this contract are not saved.");
    await expect(alert.getByRole("button", { name: "Keep editing" })).toBeFocused();
    await snap(page, info, "form-discard", { view: true });
    await alert.getByRole("button", { name: "Keep editing" }).click();
    await expect(dlg.getByLabel("Name", { exact: true })).toHaveValue("Half done");
    await dlg.getByRole("button", { name: "Cancel" }).click();
    await page.getByRole("alertdialog").getByRole("button", { name: "Discard changes" }).click();
    await expect(dlg).toHaveCount(0);
  });

  test("the form fits the screen: no horizontal scroll, 44 px controls, wide dialog from md", async ({ page, context }, info) => {
    await setup(context, info, { household: true });
    await page.goto("/contracts?new=1");
    const dlg = dialogOf(page, "Add a contract");
    await expect(dlg).toBeVisible();
    await dlg.getByLabel("Renews automatically").check();
    await expectNoHorizontalScroll(page);
    await expectAllTapTargets(dlg);
    const box = await dlg.boundingBox();
    const width = page.viewportSize()!.width;
    if (isPhone(page)) {
      expect(box!.width).toBeLessThanOrEqual(width);
      expect(box!.y + box!.height).toBeGreaterThan(page.viewportSize()!.height - 2); // a bottom sheet
    } else {
      expect(Math.round(box!.width)).toBe(512); // max-w-lg
      // Starts and Ends share a row from md.
      const starts = await dlg.getByLabel("Starts").boundingBox();
      const ends = await dlg.getByLabel("Ends (optional)").boundingBox();
      expect(Math.abs(starts!.y - ends!.y)).toBeLessThan(2);
    }
    // The 44 px checkbox row.
    const row = await dlg.locator('label[for="auto_renew"]').boundingBox();
    expect(row!.height).toBeGreaterThanOrEqual(44);
  });
});

test.describe("contract detail", () => {
  test("schedule, details and the soon warnings", async ({ page, context }, info) => {
    const { spaceId } = await setup(context, info);
    const { ids } = await seedContracts(spaceId, [CAR]);
    await page.goto(`/contracts/${ids[0]}`);
    await expect(heading1(page, "Car insurance")).toBeVisible();
    await expect(page.getByText("Harbor Insurance · Car insurance")).toBeVisible();
    const schedule = page.getByTestId("schedule-card");
    await expect(schedule).toContainText("Due in 6 days");
    await expect(schedule).toContainText("Notice deadline soon, in 5 days");
    await expect(schedule).toContainText("Notice period: 30 days before renewal");
    await expect(schedule.getByText("Renews", { exact: true })).toBeVisible();
    const details = page.getByTestId("details-card");
    await expect(details).toContainText("4 350,00 kr");
    await expect(details).toContainText("a year");
    await expect(details).toContainText("Automatically, every 12 months");
    await expect(details).toContainText("No end date");
    await expect(details).toContainText("Policy ends at renewal.");
    await expect(details.getByText("Applies to")).toHaveCount(0); // personal space
    await expect(page.getByRole("link", { name: "Expenses for this contract" })).toHaveAttribute("href", `/expenses?contract_id=${ids[0]}`);
    await expectNoHorizontalScroll(page);
    await expectAllTapTargets(page.locator("main"));
    await snap(page, info, "detail");
  });

  test("a household contract says who it applies to", async ({ page, context }, info) => {
    const { spaceId, jordanId } = await setup(context, info, { household: true });
    const { ids } = await seedContracts(spaceId, [{ ...MUSIC, member_user_id: jordanId }, { ...CAR, name: "Shared", member_user_id: null }]);
    await page.goto(`/contracts/${ids[0]}`);
    await expect(page.getByTestId("details-card")).toContainText("Jordan Kim");
    await page.goto(`/contracts/${ids[1]}`);
    await expect(page.getByTestId("details-card")).toContainText("Whole household");
  });

  test("a passed notice deadline is plain text, and a contract with nothing set says so", async ({ page, context }, info) => {
    const { spaceId } = await setup(context, info);
    const { ids } = await seedContracts(spaceId, [
      { ...CAR, schedule: { next_payment_date: isoIn(60), renewal_date: isoIn(10), notice_deadline: isoIn(-20) } },
      { name: "Plain", category: "other", schedule: { next_payment_date: isoIn(3), renewal_date: null, notice_deadline: null } },
    ]);
    await page.goto(`/contracts/${ids[0]}`);
    const schedule = page.getByTestId("schedule-card");
    await expect(schedule).toContainText("Notice period passed on");
    await expect(schedule).toContainText("It renews on");
    await expect(schedule).not.toContainText("Notice deadline soon");
    await snap(page, info, "detail-notice-passed");
    await page.goto(`/contracts/${ids[1]}`);
    const plain = page.getByTestId("schedule-card");
    await expect(plain).toContainText("Due in 3 days");
    await expect(plain).toContainText("No renewal date");
    await expect(plain).toContainText("No notice period set");
  });

  test("a missing contract, and one from another space, show the same not-found view", async ({ page, context }, info) => {
    const { spaceId, personalId } = await setup(context, info, { household: true });
    const { ids } = await seedContracts(personalId, [CAR]);
    await seedContracts(spaceId, [MUSIC]);
    await page.goto(`/contracts/${ids[0]}`); // belongs to the personal space, not the active household
    await expect(page.getByTestId("contract-not-found")).toContainText("We could not find this contract.");
    await snap(page, info, "detail-not-found");
    await page.goto("/contracts/00000000-0000-4000-8000-000000000000");
    await expect(page.getByTestId("contract-not-found")).toContainText("We could not find this contract.");
    await page.getByRole("link", { name: "Back to contracts" }).click();
    await expect(page).toHaveURL(/\/contracts$/);
    await expect(heading1(page, "Contracts")).toBeVisible();
  });

  test("loading and error states", async ({ page, context }, info) => {
    const { me, spaceId } = await setup(context, info);
    const { ids } = await seedContracts(spaceId, [CAR]);
    await failLists(me, { delay_ms: 4000 });
    await page.goto(`/contracts/${ids[0]}`);
    await expect(page.getByTestId("contract-loading")).toBeVisible();
    await snap(page, info, "detail-loading", { view: true });
    await failLists(me, { delay_ms: 0 });
    await expect(heading1(page, "Car insurance")).toBeVisible({ timeout: 15_000 });

    await failContracts(me, { list: true });
    await page.reload();
    await expect(page.getByTestId("contract-error")).toContainText("We could not load this contract just now.");
    await snap(page, info, "detail-error");
    await failContracts(me, { list: false });
    await page.getByRole("button", { name: "Retry" }).click();
    await expect(heading1(page, "Car insurance")).toBeVisible();
  });

  test("edit: the form starts from the contract, saves changes and updates the page", async ({ page, context }, info) => {
    const { spaceId } = await setup(context, info);
    const { ids } = await seedContracts(spaceId, [CAR]);
    await page.goto(`/contracts/${ids[0]}`);
    await expect(heading1(page, "Car insurance")).toBeVisible();
    await page.getByRole("button", { name: "Edit contract" }).click();
    const dlg = dialogOf(page, "Edit contract");
    await expect(dlg.getByLabel("Name", { exact: true })).toHaveValue("Car insurance");
    await expect(dlg.getByLabel("Amount")).toHaveValue("4350,00");
    await expect(dlg.getByLabel("Category")).toHaveValue(/.+/);
    await expect(dlg.getByLabel("Billed")).toHaveValue("annual");
    await expect(dlg.getByLabel("Renews automatically")).toBeChecked();
    await expect(dlg.getByLabel("Renews every (months)")).toHaveValue("12");
    await expect(dlg.getByLabel("Notice period (days, optional)")).toHaveValue("30");
    await snap(page, info, "form-edit", { view: true });

    await dlg.getByLabel("Name", { exact: true }).fill("Car insurance plus");
    await dlg.getByLabel("Amount").fill("4500.50");
    await dlg.getByLabel("Provider (optional)").fill("");
    await dlg.getByLabel("Notice period (days, optional)").fill("");
    await dlg.getByRole("button", { name: "Save contract" }).click();
    await expect(dlg).toHaveCount(0);
    await expect(heading1(page, "Car insurance plus")).toBeVisible();
    await expect(toastText(page)).toContainText("Contract saved");
    await expect(page.getByTestId("details-card")).toContainText("4 500,50 kr");
    const saved = (await storedContracts(spaceId))[0];
    expect(saved).toMatchObject({ name: "Car insurance plus", amount: "4500.50", provider: null, notice_period_days: null });
  });

  test("edit: a member who left the household is refused under Applies to", async ({ page, context }, info) => {
    const { me, spaceId, jordanId, jordan } = await setup(context, info, { household: true });
    const { ids } = await seedContracts(spaceId, [{ ...MUSIC, member_user_id: jordanId }]);
    await page.goto(`/contracts/${ids[0]}`);
    await page.getByRole("button", { name: "Edit contract" }).click();
    const dlg = dialogOf(page, "Edit contract");
    await expect(dlg.getByLabel("Applies to (optional)")).toHaveValue(jordanId);
    await removeFromHousehold(jordan, spaceId); // Jordan leaves behind the app's back
    await dlg.getByLabel("Name", { exact: true }).fill("Music");
    await dlg.getByRole("button", { name: "Save contract" }).click();
    await expect(dlg.getByText("member_user_id must be a member of this space.")).toBeVisible();
    await expect(dlg.getByLabel("Applies to (optional)")).toBeFocused();
    expect(me.email).toBeTruthy();
  });

  test("mark as cancelled asks first, then shows the badge; make active again undoes it", async ({ page, context }, info) => {
    const { spaceId } = await setup(context, info);
    const { ids } = await seedContracts(spaceId, [CAR]);
    await page.goto(`/contracts/${ids[0]}`);
    await expect(heading1(page, "Car insurance")).toBeVisible();
    await page.getByRole("button", { name: "More actions" }).click();
    await page.getByRole("menuitem", { name: "Mark as cancelled" }).click();
    const alert = page.getByRole("alertdialog", { name: "Mark Car insurance as cancelled?" });
    await expect(alert).toContainText("You can make it active again from its page.");
    await expect(alert.getByRole("button", { name: "Keep contract" })).toBeFocused();
    await snap(page, info, "confirm-cancel", { view: true });
    await alert.getByRole("button", { name: "Keep contract" }).click();
    await expect(alert).toHaveCount(0);
    expect((await storedContracts(spaceId))[0].status).toBe("active");

    await page.getByRole("button", { name: "More actions" }).click();
    await page.getByRole("menuitem", { name: "Mark as cancelled" }).click();
    await alert.getByRole("button", { name: "Mark as cancelled" }).click();
    await expect(alert).toHaveCount(0);
    await expect(page.getByTestId("cancelled-badge")).toHaveText("Cancelled");
    await expect(page.getByText("Contract marked as cancelled.")).toBeVisible();
    await expect(page.getByTestId("schedule-card")).toContainText("No payments due, cancelled");
    await expect(page.getByTestId("schedule-card")).toContainText("No notice deadline, cancelled");
    await expect(page.getByRole("button", { name: "Edit contract" })).toBeVisible();
    await snap(page, info, "detail-cancelled");

    await page.getByRole("button", { name: "More actions" }).click();
    await expect(page.getByRole("menuitem", { name: "Mark as cancelled" })).toHaveCount(0);
    await page.getByRole("menuitem", { name: "Make active again" }).click();
    await expect(page.getByText("Contract is active again.")).toBeVisible();
    await expect(page.getByTestId("cancelled-badge")).toHaveCount(0);
    expect((await storedContracts(spaceId))[0].status).toBe("active");
  });

  test("delete asks first, names the item, and returns to the list with a toast", async ({ page, context }, info) => {
    const { spaceId } = await setup(context, info);
    const { ids } = await seedContracts(spaceId, [CAR, MUSIC]);
    await page.goto(`/contracts/${ids[0]}`);
    await expect(heading1(page, "Car insurance")).toBeVisible();
    await page.getByRole("button", { name: "More actions" }).click();
    await page.getByRole("menuitem", { name: "Delete contract" }).click();
    const alert = page.getByRole("alertdialog", { name: "Delete Car insurance?" });
    await expect(alert).toContainText("Expenses linked to it stay in your list, without the link.");
    await expect(alert.getByRole("button", { name: "Keep contract" })).toBeFocused();
    await snap(page, info, "confirm-delete", { view: true });
    await alert.getByRole("button", { name: "Delete contract" }).click();
    await expect(page).toHaveURL(/\/contracts$/);
    await expect(toastText(page)).toContainText("Contract deleted");
    // Focus goes to the list heading, not to a removed row.
    await expect(page.getByRole("heading", { name: "Your contracts" })).toBeFocused();
    const rows = page.getByTestId(isPhone(page) ? "contract-card" : "contract-row");
    await expect(rows).toHaveCount(1);
    await expect(rows).toContainText("Music streaming");
    expect((await storedContracts(spaceId)).map((c) => c.name)).toEqual(["Music streaming"]);
  });

  test("a failed delete keeps the alert open with the error, and Keep contract leaves everything alone", async ({ page, context }, info) => {
    const { me, spaceId } = await setup(context, info);
    const { ids } = await seedContracts(spaceId, [CAR]);
    await page.goto(`/contracts/${ids[0]}`);
    await expect(heading1(page, "Car insurance")).toBeVisible();
    await failContracts(me, { save: true });
    await page.getByRole("button", { name: "More actions" }).click();
    await page.getByRole("menuitem", { name: "Delete contract" }).click();
    const alert = page.getByRole("alertdialog", { name: "Delete Car insurance?" });
    await alert.getByRole("button", { name: "Delete contract" }).click();
    await expect(alert.getByText("Something went wrong. Try again in a moment.")).toBeVisible();
    await expect(alert.getByRole("button", { name: "Delete contract" })).toBeEnabled();
    await failContracts(me, { save: false });
    await alert.getByRole("button", { name: "Keep contract" }).click();
    await expect(alert).toHaveCount(0);
    expect(await storedContracts(spaceId)).toHaveLength(1);
  });

  test("switching space leaves the page for the list of the new space", async ({ page, context }, info) => {
    const { spaceId, personalId } = await setup(context, info, { household: true });
    const { ids } = await seedContracts(spaceId, [CAR]);
    await seedContracts(personalId, [MUSIC]);
    await page.goto(`/contracts/${ids[0]}`);
    await expect(heading1(page, "Car insurance")).toBeVisible();
    await page.getByRole("button", { name: /^Active space/ }).click();
    await page.getByRole("menuitemradio", { name: /Personal/ }).click();
    await expect(page).toHaveURL(/\/contracts$/);
    await expect(page.getByRole("link", { name: /Music streaming/ })).toBeVisible();
  });

  test("clicking a contract in the list opens its detail page", async ({ page, context }, info) => {
    const { spaceId } = await setup(context, info);
    await seedContracts(spaceId, [CAR]);
    await page.goto("/contracts");
    await page.getByRole("link", { name: /Car insurance/ }).click();
    await expect(heading1(page, "Car insurance")).toBeVisible();
    await expect(page).toHaveURL(/\/contracts\/[0-9a-f-]+$/);
    // Wait for the page to settle before another navigation (see tests/invitations-screens.spec.ts).
    await expect(page.getByTestId("schedule-card")).toBeVisible();
    await page.waitForLoadState("load");
    await page.getByRole("link", { name: "Contracts" }).first().click();
    await expect(heading1(page, "Contracts")).toBeVisible();
  });
});
