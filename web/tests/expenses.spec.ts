import { expect, test, type Page } from "@playwright/test";
import {
  failFinance,
  failLists,
  isoIn,
  seedContracts,
  seedExpenses,
  storedFinance,
  type SeedExpense,
} from "./support/auth";
import {
  dialogOf,
  expectAllTapTargets,
  expectNoHorizontalScroll,
  heading1,
  isPhone,
  setFilter,
  setup,
  snap as snapTo,
  toastText,
} from "./support/ui";

// HEM-022: the expenses list, quick add, edit and delete (docs/design/finance.md section 5), against the
// mock backend (tests/support/mock-backend.mjs). Each test signs in as its own user and seeds its own
// spaces and records, so parallel tests never share state. Screenshots of every state land in
// test-results/screenshots/hem022/<phone|tablet|desktop>/<state>-<light|dark>.png.

const snap = (page: Page, info: Parameters<typeof snapTo>[1], name: string, opts: { view?: boolean } = {}) => snapTo(page, info, "hem022", name, opts);
const rowsOf = (page: Page) => page.getByTestId(isPhone(page) ? "expense-card" : "expense-row");
const apply = "Show expenses";
const filter = (page: Page, label: string, value: string) => setFilter(page, apply, label, value);

const GROCERIES: SeedExpense = { category: "food", description: "Groceries", merchant: "Corner Market", amount: "64.20", spent_on: "2026-11-12" };
const TRAIN: SeedExpense = {
  category: "transport",
  description: "Train tickets",
  amount: "540.00",
  currency: "SEK",
  spent_on: "2026-11-09",
  base_amount: { amount: "48.11", currency: "EUR" },
};
const COFFEE: SeedExpense = { category: "subscription.streaming", description: "Coffee subscription", amount: "9.00", currency: "USD", spent_on: "2026-10-30" };

test.describe.configure({ timeout: 120_000 });

test.describe("expense list", () => {
  test("grouped by month, with category, merchant, amounts, converted amounts and no overflow", async ({ page, context }, info) => {
    const { spaceId } = await setup(context, info);
    await seedExpenses(spaceId, [GROCERIES, TRAIN, COFFEE]);
    await page.goto("/expenses");
    await expect(heading1(page, "Expenses")).toBeVisible();
    await expect(rowsOf(page)).toHaveCount(3);

    // Month headers are h2s with a count; the browser adds no money up (F10).
    await expect(page.getByRole("heading", { level: 2, name: "November 2026" })).toBeVisible();
    await expect(page.getByRole("heading", { level: 2, name: "October 2026" })).toBeVisible();
    await expect(page.getByText("2 expenses")).toBeVisible();
    await expect(page.getByText("1 expense", { exact: true })).toBeVisible();

    const groceries = rowsOf(page).filter({ hasText: "Groceries" });
    await expect(groceries).toContainText("€64.20");
    await expect(groceries).toContainText("Corner Market");
    await expect(groceries).not.toContainText("≈");
    // Another currency shows its code, and the base line when the API sent one; nothing when it did not.
    const train = rowsOf(page).filter({ hasText: "Train tickets" });
    await expect(train).toContainText("SEK 540.00");
    await expect(train).toContainText("About EUR 48.11");
    const coffee = rowsOf(page).filter({ hasText: "Coffee subscription" });
    await expect(coffee).toContainText("USD 9.00");
    await expect(coffee).not.toContainText("≈");
    if ((page.viewportSize()?.width ?? 0) !== 768) await expect(groceries).toContainText("Food");

    // The whole row is one button with the title, amount and date as its name.
    await expect(page.getByRole("button", { name: "Groceries, €64.20, 12 Nov 2026" })).toBeVisible();
    await expectNoHorizontalScroll(page);
    await expectAllTapTargets(page.locator("main"));
    await snap(page, info, "list-populated");
  });

  test("a household list says who an expense is for, and links to a contract by name", async ({ page, context }, info) => {
    const { spaceId, jordanId } = await setup(context, info, { household: true });
    const { ids } = await seedContracts(spaceId, [{ name: "Electricity", category: "utility.electricity" }]);
    await seedExpenses(spaceId, [
      { ...TRAIN, member_user_id: jordanId },
      { ...GROCERIES, contract_id: ids[0] },
    ]);
    await page.goto("/expenses");
    await expect(rowsOf(page)).toHaveCount(2);
    await expect(rowsOf(page).filter({ hasText: "Train tickets" })).toContainText("For Jordan Kim");
    await expect(rowsOf(page).filter({ hasText: "Groceries" })).toContainText("Linked to Electricity");
    await expect(rowsOf(page).filter({ hasText: "Groceries" })).not.toContainText("For ");
    await expectNoHorizontalScroll(page);
    await snap(page, info, "list-household");
  });

  test("Show more expenses loads the next page; the last month says 'so far' until then", async ({ page, context }, info) => {
    const { spaceId } = await setup(context, info);
    await seedExpenses(
      spaceId,
      Array.from({ length: 27 }, (_, i) => ({ category: "food", description: `Expense ${String(i + 1).padStart(2, "0")}`, spent_on: "2026-11-15" })),
    );
    await page.goto("/expenses");
    await expect(rowsOf(page)).toHaveCount(25);
    await expect(page.getByText("25 expenses so far")).toBeVisible();
    await snap(page, info, "list-more");
    const more = page.getByRole("button", { name: "Show more expenses" });
    await more.click();
    await expect(rowsOf(page)).toHaveCount(27);
    await expect(page.getByText("27 expenses", { exact: true })).toBeVisible();
    await expect(page.getByRole("heading", { level: 2, name: "November 2026" })).toHaveCount(1);
    await expect(more).toHaveCount(0);
  });

  test("a page requested before a filter change is dropped, not appended to the new list", async ({ page, context }, info) => {
    const { spaceId } = await setup(context, info);
    await seedExpenses(spaceId, [
      ...Array.from({ length: 27 }, (_, i) => ({ category: "food", description: `Food ${String(i + 1).padStart(2, "0")}` })),
      { category: "transport", description: "Only transport" },
    ]);
    await page.goto("/expenses");
    await expect(rowsOf(page)).toHaveCount(25);
    let release: () => void = () => {};
    const gate = new Promise<void>((resolve) => (release = resolve));
    await page.route(
      (url) => url.pathname.endsWith("/expenses") && url.searchParams.has("cursor"),
      async (route) => {
        await gate;
        await route.continue();
      },
    );
    const held = page.waitForResponse((r) => r.url().includes("cursor="));
    await page.getByRole("button", { name: "Show more expenses" }).click();
    await filter(page, "Category", "transport");
    await expect(rowsOf(page)).toHaveCount(1);
    release();
    await held;
    await page.evaluate(() => new Promise((resolve) => setTimeout(resolve, 300)));
    await expect(rowsOf(page)).toHaveCount(1);
    await expect(rowsOf(page)).toContainText("Only transport");
    await expect(page.getByRole("button", { name: /Show more expenses|Loading/ })).toHaveCount(0);
  });

  test("focus goes to the list heading after the first add from an empty list", async ({ page, context }, info) => {
    await setup(context, info);
    await page.goto("/expenses");
    await page.getByRole("button", { name: "Add an expense" }).click(); // the empty state's button: it unmounts after the save
    const dlg = dialogOf(page, "Add an expense");
    await dlg.getByLabel("Amount", { exact: true }).fill("8");
    await dlg.getByLabel("Category", { exact: true }).selectOption({ label: "Food" });
    await dlg.getByRole("button", { name: "Save expense" }).click();
    await expect(dlg).toHaveCount(0);
    await expect(rowsOf(page)).toHaveCount(1);
    await expect(page.getByRole("heading", { name: "Your expenses" })).toBeFocused();
  });

  test("empty: one add button, in the empty state and not in the header", async ({ page, context }, info) => {
    await setup(context, info);
    await page.goto("/expenses");
    await expect(page.getByRole("heading", { name: "No expenses this month" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Add an expense" })).toHaveCount(1);
    await expect(page.getByTestId("add-expense")).toHaveCount(0);
    await expectNoHorizontalScroll(page);
    await snap(page, info, "list-empty");
    await page.getByRole("button", { name: "Add an expense" }).click();
    await expect(dialogOf(page, "Add an expense")).toBeVisible();
  });

  test("loading skeleton, then an error with Retry", async ({ page, context }, info) => {
    const { me, spaceId } = await setup(context, info);
    await seedExpenses(spaceId, [GROCERIES]);
    await failLists(me, { delay_ms: 4000 });
    await page.goto("/expenses");
    await expect(page.getByTestId("expenses-loading")).toBeVisible();
    await expect(page.getByTestId("expenses-loading")).toHaveAttribute("aria-busy", "true");
    await snap(page, info, "list-loading", { view: true });
    await failLists(me, { delay_ms: 0 });
    await expect(page.getByTestId("expenses-list")).toBeVisible({ timeout: 15_000 });

    await failFinance(me, { list: true });
    await page.reload();
    await expect(page.getByTestId("expenses-error")).toContainText("We could not load your expenses just now.");
    await snap(page, info, "list-error");
    await failFinance(me, { list: false });
    await page.getByRole("button", { name: "Retry" }).click();
    await expect(page.getByTestId("expenses-list")).toBeVisible();
  });

  test("switching space shows the skeleton, then only the new space's expenses", async ({ page, context }, info) => {
    const { me, spaceId, personalId } = await setup(context, info, { household: true });
    await seedExpenses(personalId, [{ ...GROCERIES, description: "Personal lunch" }]);
    await seedExpenses(spaceId, [{ ...TRAIN, description: "Household train" }]);
    await page.goto("/expenses");
    await expect(rowsOf(page)).toContainText("Household train");
    await failLists(me, { delay_ms: 2500 });
    await page.getByRole("button", { name: /^Active space/ }).click();
    await page.getByRole("menuitemradio", { name: /Personal/ }).click();
    await expect(page.getByTestId("expenses-loading")).toBeVisible();
    await expect(page.getByText("Household train")).toHaveCount(0);
    await expect(rowsOf(page)).toContainText("Personal lunch", { timeout: 15_000 });
    await expect(rowsOf(page)).toHaveCount(1);
  });

  test("a category that could not be loaded reads 'Category unavailable', never a blank", async ({ page, context }, info) => {
    const { spaceId } = await setup(context, info);
    await seedExpenses(spaceId, [{ category: "food", amount: "12.00", spent_on: "2026-11-12" }]);
    await page.route("**/api/v1/spaces/*/categories*", (route) =>
      route.fulfill({ status: 500, contentType: "application/problem+json", body: JSON.stringify({ title: "Internal Server Error", status: 500 }) }),
    );
    await page.goto("/expenses");
    await expect(rowsOf(page)).toContainText("Category unavailable");
    // The form cannot offer categories either: it says so and offers Retry.
    await page.getByTestId("add-expense").click();
    const dlg = dialogOf(page, "Add an expense");
    await expect(dlg).toContainText("We could not load the lists for this form just now.");
    await page.unroute("**/api/v1/spaces/*/categories*");
    await dlg.getByRole("button", { name: "Retry" }).click();
    await expect(dlg.getByLabel("Category", { exact: true })).toBeVisible();
  });
});

test.describe("expense filters", () => {
  test("Category filters by group and by one category", async ({ page, context }, info) => {
    const { spaceId } = await setup(context, info);
    await seedExpenses(spaceId, [GROCERIES, TRAIN, { ...COFFEE, category: "subscription.software", description: "Editor" }, COFFEE]);
    await page.goto("/expenses");
    await expect(rowsOf(page)).toHaveCount(4);
    await filter(page, "Category", "subscription");
    await expect(rowsOf(page)).toHaveCount(2);
    await filter(page, "Category", "subscription.software");
    await expect(rowsOf(page)).toHaveCount(1);
    await expect(rowsOf(page)).toContainText("Editor");
    await filter(page, "Category", "");
    await expect(rowsOf(page)).toHaveCount(4);
  });

  test("From and To are inclusive; a reversed range is explained and not applied", async ({ page, context }, info) => {
    const { spaceId } = await setup(context, info);
    await seedExpenses(spaceId, [
      { ...GROCERIES, description: "Nov 12", spent_on: "2026-11-12" },
      { ...GROCERIES, description: "Nov 09", spent_on: "2026-11-09" },
      { ...GROCERIES, description: "Oct 30", spent_on: "2026-10-30" },
    ]);
    await page.goto("/expenses");
    await filter(page, "From", "2026-11-09");
    await expect(rowsOf(page)).toHaveCount(2);
    await filter(page, "To", "2026-11-09");
    await expect(rowsOf(page)).toHaveCount(1);
    await expect(rowsOf(page)).toContainText("Nov 09");

    if (isPhone(page)) {
      await page.getByTestId("filters-button").click();
      const sheet = page.getByRole("dialog", { name: "Filters" });
      await sheet.getByLabel("To", { exact: true }).fill("2026-11-01");
      await sheet.getByRole("button", { name: apply }).click();
      await expect(sheet.getByText("The From date must be before the To date.")).toBeVisible();
      await expect(sheet).toBeVisible(); // not applied: the sheet stays open
      await snap(page, info, "filter-range-error", { view: true });
    } else {
      await page.getByTestId("filter-row").getByLabel("To", { exact: true }).fill("2026-11-01");
      await expect(page.getByTestId("filter-row").getByText("The From date must be before the To date.")).toBeVisible();
      await expect(rowsOf(page)).toHaveCount(1); // still the last valid result
      await snap(page, info, "filter-range-error");
    }
  });

  test("Applies to: All, Whole household and each member (household only)", async ({ page, context }, info) => {
    const { spaceId, jordanId } = await setup(context, info, { household: true });
    await seedExpenses(spaceId, [
      { ...GROCERIES, member_user_id: null },
      { ...TRAIN, member_user_id: jordanId },
      { ...COFFEE, member_user_id: null },
    ]);
    await page.goto("/expenses");
    await expect(rowsOf(page)).toHaveCount(3);
    await filter(page, "Applies to", "household");
    await expect(rowsOf(page)).toHaveCount(2);
    await expect(rowsOf(page).filter({ hasText: "Train tickets" })).toHaveCount(0);
    await filter(page, "Applies to", jordanId);
    await expect(rowsOf(page)).toHaveCount(1);
    await expect(rowsOf(page)).toContainText("Train tickets");
    await filter(page, "Applies to", "all");
    await expect(rowsOf(page)).toHaveCount(3);
    await snap(page, info, "filters-household");
  });

  test("a personal space has no Applies to filter", async ({ page, context }, info) => {
    const { spaceId } = await setup(context, info);
    await seedExpenses(spaceId, [GROCERIES]);
    await page.goto("/expenses");
    await expect(rowsOf(page)).toHaveCount(1);
    await expect(page.getByLabel("Applies to", { exact: true })).toHaveCount(0);
  });

  test("the contract page links here with a removable chip", async ({ page, context }, info) => {
    const { spaceId } = await setup(context, info);
    const { ids } = await seedContracts(spaceId, [{ name: "Car insurance", category: "insurance.car" }, { name: "Gym", category: "membership.gym" }]);
    await seedExpenses(spaceId, [
      { ...GROCERIES, description: "Premium", contract_id: ids[0] },
      { ...TRAIN, description: "Gym fee", contract_id: ids[1] },
      COFFEE,
    ]);
    await page.goto(`/contracts/${ids[0]}`);
    await page.getByRole("link", { name: "Expenses for this contract" }).click();
    await expect(page).toHaveURL(new RegExp(`/expenses\\?contract_id=${ids[0]}`));
    await expect(rowsOf(page)).toHaveCount(1);
    await expect(rowsOf(page)).toContainText("Premium");
    const chip = page.getByTestId("contract-chip");
    await expect(chip).toContainText("Car insurance");
    const remove = page.getByRole("button", { name: "Remove filter: Car insurance" });
    await expect(remove).toBeVisible();
    // The chip and its remove control each have a 44 px hit area.
    expect((await chip.boundingBox())!.height).toBeGreaterThanOrEqual(44);
    const removeBox = (await remove.boundingBox())!;
    expect(removeBox.height).toBeGreaterThanOrEqual(44);
    expect(removeBox.width).toBeGreaterThanOrEqual(44);
    await snap(page, info, "list-contract-chip");
    await remove.click();
    await expect(rowsOf(page)).toHaveCount(3);
    await expect(chip).toHaveCount(0);
  });

  test("tap targets at 375 px, measured: Add an expense, Filters, the contract chip and its remove control", async ({ page, context }, info) => {
    test.skip(!isPhone(page), "375 px is the phone layout");
    const { spaceId } = await setup(context, info);
    const { ids } = await seedContracts(spaceId, [{ name: "Car insurance", category: "insurance.car" }]);
    await seedExpenses(spaceId, [{ ...GROCERIES, contract_id: ids[0] }]);
    await page.goto(`/expenses?contract_id=${ids[0]}`);
    await expect(rowsOf(page)).toHaveCount(1);
    expect(page.viewportSize()!.width).toBe(375);
    const heights = await page.evaluate(() => {
      const h = (el: Element | null) => (el ? el.getBoundingClientRect().height : 0);
      const w = (el: Element | null) => (el ? el.getBoundingClientRect().width : 0);
      const q = (s: string) => document.querySelector(s);
      return {
        add: h(q('[data-testid="add-expense"]')),
        filters: h(q('[data-testid="filters-button"]')),
        chip: h(q('[data-testid="contract-chip"]')),
        removeH: h(q('[data-testid="contract-chip-remove"]')),
        removeW: w(q('[data-testid="contract-chip-remove"]')),
      };
    });
    for (const [name, value] of Object.entries(heights)) expect(value, name).toBeGreaterThanOrEqual(44);
  });

  test("no match: an inline message with Clear filters", async ({ page, context }, info) => {
    const { spaceId } = await setup(context, info);
    await seedExpenses(spaceId, [GROCERIES]);
    await page.goto("/expenses");
    await filter(page, "Category", "transport");
    await expect(page.getByTestId("no-match")).toContainText("No matching expenses");
    await expect(page.getByRole("button", { name: "Add an expense" })).toHaveCount(1); // the header's: no second one in the card
    await snap(page, info, "list-no-match");
    // "Clear filters" is a text button (ghost), at least 44 px tall.
    const clear = page.getByTestId("no-match").getByRole("button", { name: "Clear filters" });
    expect((await clear.boundingBox())!.height).toBeGreaterThanOrEqual(44);
    expect(await clear.evaluate((el) => getComputedStyle(el).backgroundColor)).toBe("rgba(0, 0, 0, 0)");
    await clear.click();
    await expect(rowsOf(page)).toHaveCount(1);
  });

  test("the filter sheet on phone: a count in the button, Clear filters, Show expenses", async ({ page, context }, info) => {
    test.skip(!isPhone(page), "The filter sheet is the phone layout");
    const { spaceId } = await setup(context, info);
    await seedExpenses(spaceId, [GROCERIES, TRAIN]);
    await page.goto("/expenses");
    const button = page.getByTestId("filters-button");
    await expect(button).toHaveText("Filters");
    await button.click();
    const sheet = page.getByRole("dialog", { name: "Filters" });
    await sheet.getByLabel("Category", { exact: true }).selectOption("food");
    await sheet.getByLabel("From", { exact: true }).fill("2026-11-01");
    await snap(page, info, "filter-sheet", { view: true });
    await expectAllTapTargets(sheet);
    await sheet.getByRole("button", { name: apply }).click();
    await expect(button).toHaveText("Filters: 2 applied");
    await button.click();
    await sheet.getByRole("button", { name: "Clear filters" }).click();
    await sheet.getByRole("button", { name: apply }).click();
    await expect(button).toHaveText("Filters");
    await expect(rowsOf(page)).toHaveCount(2);
  });
});

test.describe("add an expense", () => {
  test("quick add: amount first, saves with a string amount, a toast, and remembers the category", async ({ page, context }, info) => {
    const { spaceId } = await setup(context, info);
    await seedExpenses(spaceId, [GROCERIES]);
    await page.goto("/expenses");
    await page.getByTestId("add-expense").click();
    const dlg = dialogOf(page, "Add an expense");
    await expect(dlg).toBeVisible();
    await expect(dlg.getByLabel("Amount", { exact: true })).toBeFocused();
    await expect(dlg.getByLabel("Currency")).toHaveValue("EUR");
    await expect(dlg.getByLabel("Date", { exact: true })).toHaveValue(isoIn(0));
    await expect(dlg.getByLabel("Category", { exact: true })).toHaveValue("");
    await expect(dlg.getByLabel("Applies to (optional)")).toHaveCount(0); // personal space
    // Description, merchant and the contract are under "More details", closed at first.
    await expect(dlg.getByRole("button", { name: "More details" })).toHaveAttribute("aria-expanded", "false");
    await expect(dlg.getByLabel("Description (optional)")).toBeHidden();
    await snap(page, info, "form-empty", { view: true });

    await dlg.getByLabel("Amount", { exact: true }).fill("12.50");
    await dlg.getByLabel("Category", { exact: true }).selectOption({ label: "Food" });
    await dlg.getByRole("button", { name: "More details" }).click();
    await dlg.getByLabel("Description (optional)").fill("Lunch");
    await dlg.getByLabel("Merchant (optional)").fill("Corner Cafe");
    await snap(page, info, "form-filled", { view: true });
    await dlg.getByRole("button", { name: "Save expense" }).click();
    await expect(dlg).toHaveCount(0);
    await expect(toastText(page)).toContainText("Expense added.");
    await expect(rowsOf(page)).toHaveCount(2);
    await expect(rowsOf(page).filter({ hasText: "Lunch" })).toContainText("€12.50");

    const saved = (await storedFinance<Record<string, unknown>>(spaceId, "expenses")).find((e) => e.description === "Lunch");
    expect(saved).toMatchObject({ amount: "12.50", currency: "EUR", category: "food", merchant: "Corner Cafe", contract_id: null, member_user_id: null, spent_on: isoIn(0) });

    // The next quick add starts with the category used last in this space (F19).
    await page.getByTestId("add-expense").click();
    await expect(dialogOf(page, "Add an expense").getByLabel("Category", { exact: true })).not.toHaveValue("");
    await expect(dialogOf(page, "Add an expense").getByLabel("Category", { exact: true }).locator("option:checked")).toHaveText("Food");
  });

  test("Save and add another keeps the dialog, the category and the date, and focuses the amount", async ({ page, context }, info) => {
    const { spaceId } = await setup(context, info);
    await page.goto("/expenses");
    await page.getByRole("button", { name: "Add an expense" }).click();
    const dlg = dialogOf(page, "Add an expense");
    await dlg.getByLabel("Amount", { exact: true }).fill("3.40");
    await dlg.getByLabel("Category", { exact: true }).selectOption({ label: "Transport" });
    await dlg.getByLabel("Date", { exact: true }).fill("2026-11-05");
    await dlg.getByRole("button", { name: "Save and add another" }).click();
    await expect(toastText(page)).toContainText("Expense added. Add another.");
    await expect(dlg).toBeVisible();
    await expect(dlg.getByLabel("Amount", { exact: true })).toHaveValue("");
    await expect(dlg.getByLabel("Amount", { exact: true })).toBeFocused();
    await expect(dlg.getByLabel("Category", { exact: true })).toHaveText(/Transport/);
    await expect(dlg.getByLabel("Date", { exact: true })).toHaveValue("2026-11-05");
    await dlg.getByLabel("Amount", { exact: true }).fill("4");
    await dlg.getByRole("button", { name: "Save expense" }).click();
    await expect(dlg).toHaveCount(0);
    await expect(rowsOf(page)).toHaveCount(2);
    expect((await storedFinance<{ amount: string }>(spaceId, "expenses")).map((e) => e.amount).sort()).toEqual(["3.40", "4"]);
  });

  test("a household form offers Applies to with names, never emails, and sends the member", async ({ page, context }, info) => {
    const { spaceId, jordanId } = await setup(context, info, { household: true });
    await page.goto("/expenses");
    await page.getByRole("button", { name: "Add an expense" }).click();
    const dlg = dialogOf(page, "Add an expense");
    await dlg.getByRole("button", { name: "More details" }).click();
    const applies = dlg.getByLabel("Applies to (optional)");
    await expect(applies.locator("option")).toHaveText(["Whole household", "Alex Lee", "Jordan Kim"]);
    await expect(dlg).not.toContainText("@");
    await dlg.getByLabel("Amount", { exact: true }).fill("20");
    await dlg.getByLabel("Category", { exact: true }).selectOption({ label: "Food" });
    await applies.selectOption(jordanId);
    await dlg.getByRole("button", { name: "Save expense" }).click();
    await expect(dlg).toHaveCount(0);
    expect((await storedFinance<{ member_user_id: string }>(spaceId, "expenses"))[0].member_user_id).toBe(jordanId);
  });

  test("an expense can be linked to a contract, and the form says what happens when the contract goes", async ({ page, context }, info) => {
    const { spaceId } = await setup(context, info);
    const { ids } = await seedContracts(spaceId, [{ name: "Electricity", category: "utility.electricity" }, { name: "Old plan", category: "utility.internet", status: "cancelled" }]);
    await page.goto("/expenses");
    await page.getByRole("button", { name: "Add an expense" }).click();
    const dlg = dialogOf(page, "Add an expense");
    await dlg.getByRole("button", { name: "More details" }).click();
    await expect(dlg).toContainText("If the contract is deleted, this expense stays and loses the link.");
    await expect(dlg.getByLabel("Linked contract (optional)").locator("option")).toHaveText(["No contract", "Electricity"]); // active ones only
    await dlg.getByLabel("Amount", { exact: true }).fill("75");
    await dlg.getByLabel("Category", { exact: true }).selectOption({ label: "Electricity" });
    await dlg.getByLabel("Linked contract (optional)").selectOption(ids[0]);
    await dlg.getByRole("button", { name: "Save expense" }).click();
    await expect(dlg).toHaveCount(0);
    await expect(rowsOf(page)).toContainText("Linked to Electricity");
    expect((await storedFinance<{ contract_id: string }>(spaceId, "expenses"))[0].contract_id).toBe(ids[0]);
  });

  test("client validation: messages under the fields, focus on the first, no request sent", async ({ page, context }, info) => {
    const { spaceId } = await setup(context, info);
    await page.goto("/expenses");
    await page.getByRole("button", { name: "Add an expense" }).click();
    const dlg = dialogOf(page, "Add an expense");
    await expect(dlg.locator("#amount-hint")).toHaveText("Use . before the cents.");
    await dlg.getByLabel("Date", { exact: true }).fill("");
    await dlg.getByRole("button", { name: "Save expense" }).click();
    await expect(dlg.getByText("Enter the amount.")).toBeVisible();
    await expect(dlg.getByText("Choose a category.")).toBeVisible();
    await expect(dlg.getByText("Enter the date you paid.")).toBeVisible();
    await expect(dlg.getByLabel("Amount", { exact: true })).toBeFocused();
    await expect(dlg.getByLabel("Amount", { exact: true })).toHaveAttribute("aria-invalid", "true");
    // The error takes the hint's place, right under the field, and describes it.
    await expect(dlg.locator("#amount-hint")).toHaveCount(0);
    await expect(dlg.getByLabel("Amount", { exact: true })).toHaveAttribute("aria-describedby", "amount-error");
    await snap(page, info, "form-errors", { view: true });

    await dlg.getByLabel("Amount", { exact: true }).fill("12,50");
    await dlg.getByLabel("Category", { exact: true }).selectOption({ label: "Food" });
    await dlg.getByLabel("Date", { exact: true }).fill(isoIn(3));
    await dlg.getByRole("button", { name: "Save expense" }).click();
    await expect(dlg.getByText("Enter an amount like 12.50.")).toBeVisible();
    await expect(dlg.getByText("The date cannot be more than a day in the future.")).toBeVisible();
    // Tomorrow is fine (Q10).
    await dlg.getByLabel("Amount", { exact: true }).fill("12.50");
    await dlg.getByLabel("Date", { exact: true }).fill(isoIn(1));
    await dlg.getByRole("button", { name: "Save expense" }).click();
    await expect(dlg).toHaveCount(0);
    expect(await storedFinance(spaceId, "expenses")).toHaveLength(1);
  });

  test("a server refusal and a lost connection show a message at the top; the values stay", async ({ page, context }, info) => {
    const { me, spaceId } = await setup(context, info);
    await page.goto("/expenses");
    await page.getByRole("button", { name: "Add an expense" }).click();
    const dlg = dialogOf(page, "Add an expense");
    await dlg.getByLabel("Amount", { exact: true }).fill("12.50");
    await dlg.getByLabel("Category", { exact: true }).selectOption({ label: "Food" });
    await failFinance(me, { save: true });
    await dlg.getByRole("button", { name: "Save expense" }).click();
    await expect(dlg.getByTestId("form-message").first()).toContainText("Something went wrong. Try again in a moment.");
    await expect(dlg.getByLabel("Amount", { exact: true })).toHaveValue("12.50");
    await failFinance(me, { save: false });

    await page.route("**/api/v1/spaces/*/expenses", (route) => route.abort());
    await dlg.getByRole("button", { name: "Save expense" }).click();
    await expect(dlg.getByTestId("form-message").first()).toContainText("We could not reach the server. Check your connection and try again.");
    await expect(dlg.getByLabel("Amount", { exact: true })).toHaveValue("12.50");
    await page.unroute("**/api/v1/spaces/*/expenses");
    await dlg.getByRole("button", { name: "Save expense" }).click();
    await expect(dlg).toHaveCount(0);
    expect(await storedFinance(spaceId, "expenses")).toHaveLength(1);
  });

  test("after Save and add another, Cancel closes at once: saved work is not unsaved changes", async ({ page, context }, info) => {
    await setup(context, info);
    await page.goto("/expenses");
    await page.getByRole("button", { name: "Add an expense" }).click();
    const dlg = dialogOf(page, "Add an expense");
    await dlg.getByLabel("Amount", { exact: true }).fill("3.40");
    await dlg.getByLabel("Category", { exact: true }).selectOption({ label: "Transport" });
    await dlg.getByRole("button", { name: "Save and add another" }).click();
    await expect(dlg.getByLabel("Amount", { exact: true })).toHaveValue("");
    await dlg.getByRole("button", { name: "Cancel" }).click();
    await expect(dlg).toHaveCount(0);
    await expect(page.getByRole("alertdialog")).toHaveCount(0);
    // Typing something new after a save is unsaved again.
    await page.getByTestId("add-expense").click();
    await dlg.getByLabel("Amount", { exact: true }).fill("1");
    await dlg.getByRole("button", { name: "Cancel" }).click();
    await expect(page.getByRole("alertdialog", { name: "Discard changes?" })).toBeVisible();
  });

  test("a toast never covers an open confirmation", async ({ page, context }, info) => {
    const { spaceId } = await setup(context, info);
    await seedExpenses(spaceId, [GROCERIES, TRAIN]);
    await page.goto("/expenses");
    await page.getByRole("button", { name: "Groceries, €64.20, 12 Nov 2026" }).click();
    const dlg = dialogOf(page, "Edit expense");
    await dlg.getByLabel("Merchant (optional)").fill("Corner Shop");
    await dlg.getByRole("button", { name: "Save changes" }).click();
    await expect(toastText(page)).toContainText("Expense saved.");
    await page.getByRole("button", { name: "Train tickets, SEK 540.00, 9 Nov 2026" }).click();
    await dialogOf(page, "Edit expense").getByRole("button", { name: "Delete expense" }).click();
    const alert = page.getByRole("alertdialog", { name: "Delete this expense?" });
    await expect(toastText(page)).toBeVisible(); // still on screen, behind the dialog
    const confirm = alert.getByRole("button", { name: "Delete expense" });
    const box = (await confirm.boundingBox())!;
    const top = await page.evaluate(([x, y]) => document.elementFromPoint(x, y)?.closest('[role="alertdialog"]') !== null, [box.x + box.width / 2, box.y + box.height / 2]);
    expect(top).toBe(true);
    // The toast keeps its place 16 px above the phone bottom nav (or the screen edge from md).
    const region = (await page.getByTestId("toast-region").boundingBox())!;
    expect(region.y + region.height).toBeLessThanOrEqual(page.viewportSize()!.height - 16);
  });

  test("unsaved changes ask before closing; a clean form closes at once", async ({ page, context }, info) => {
    await setup(context, info);
    await page.goto("/expenses");
    await page.getByRole("button", { name: "Add an expense" }).click();
    const dlg = dialogOf(page, "Add an expense");
    await dlg.getByRole("button", { name: "Cancel" }).click();
    await expect(dlg).toHaveCount(0);

    await page.getByRole("button", { name: "Add an expense" }).click();
    await dlg.getByLabel("Amount", { exact: true }).fill("5");
    await dlg.getByRole("button", { name: "Cancel" }).click();
    const alert = page.getByRole("alertdialog", { name: "Discard changes?" });
    await expect(alert).toContainText("Your changes to this expense are not saved.");
    await expect(alert.getByRole("button", { name: "Keep editing" })).toBeFocused();
    await alert.getByRole("button", { name: "Keep editing" }).click();
    await expect(dlg.getByLabel("Amount", { exact: true })).toHaveValue("5");
    await page.keyboard.press("Escape");
    await expect(alert).toBeVisible();
    await alert.getByRole("button", { name: "Discard changes" }).click();
    await expect(dlg).toHaveCount(0);
  });

  test("the form fits the screen: no horizontal scroll, 44 px controls, centred dialog from md", async ({ page, context }, info) => {
    await setup(context, info, { household: true });
    await page.goto("/expenses");
    await page.getByRole("button", { name: "Add an expense" }).click();
    const dlg = dialogOf(page, "Add an expense");
    await dlg.getByRole("button", { name: "More details" }).click();
    await expectNoHorizontalScroll(page);
    await expectAllTapTargets(dlg);
    const box = (await dlg.boundingBox())!;
    const width = page.viewportSize()!.width;
    if (isPhone(page)) {
      expect(box.width).toBeLessThanOrEqual(width);
      expect(box.y + box.height).toBeGreaterThan(page.viewportSize()!.height - 2); // a bottom sheet
    } else {
      expect(box.width).toBeLessThanOrEqual(448 + 1);
      expect(Math.abs(box.x + box.width / 2 - width / 2)).toBeLessThan(2); // centred
    }
    await snap(page, info, "form-household-details", { view: true });
  });
});

test.describe("edit and delete an expense", () => {
  test("tapping a row opens the form with its values; saving updates the list and moves focus to the heading", async ({ page, context }, info) => {
    const { spaceId } = await setup(context, info);
    await seedExpenses(spaceId, [GROCERIES, TRAIN]);
    await page.goto("/expenses");
    await page.getByRole("button", { name: "Groceries, €64.20, 12 Nov 2026" }).click();
    const dlg = dialogOf(page, "Edit expense");
    await expect(dlg).toBeVisible();
    await expect(dlg.getByLabel("Amount", { exact: true })).toHaveValue("64.20");
    await expect(dlg.getByLabel("Date", { exact: true })).toHaveValue("2026-11-12");
    await expect(dlg.getByRole("button", { name: "More details" })).toHaveAttribute("aria-expanded", "true"); // open when editing
    await expect(dlg.getByLabel("Description (optional)")).toHaveValue("Groceries");
    await expect(dlg.getByLabel("Merchant (optional)")).toHaveValue("Corner Market");
    await expect(dlg.getByRole("button", { name: "Save and add another" })).toHaveCount(0);
    await snap(page, info, "form-edit", { view: true });

    await dlg.getByLabel("Amount", { exact: true }).fill("70.05");
    await dlg.getByLabel("Description (optional)").fill("Weekly groceries");
    await dlg.getByRole("button", { name: "Save changes" }).click();
    await expect(dlg).toHaveCount(0);
    await expect(toastText(page)).toContainText("Expense saved.");
    await expect(rowsOf(page).filter({ hasText: "Weekly groceries" })).toContainText("€70.05");
    await expect(rowsOf(page)).toHaveCount(2);
    await expect(page.getByRole("heading", { name: "Your expenses" })).toBeFocused();
    const saved = (await storedFinance<Record<string, unknown>>(spaceId, "expenses")).find((e) => e.description === "Weekly groceries");
    expect(saved).toMatchObject({ amount: "70.05", currency: "EUR", merchant: "Corner Market", spent_on: "2026-11-12" });
  });

  test("an expense in another currency keeps its currency and amount when edited", async ({ page, context }, info) => {
    const { spaceId } = await setup(context, info);
    await seedExpenses(spaceId, [TRAIN]);
    await page.goto("/expenses");
    await page.getByRole("button", { name: "Train tickets, SEK 540.00, 9 Nov 2026" }).click();
    const dlg = dialogOf(page, "Edit expense");
    await expect(dlg.getByLabel("Currency")).toHaveValue("SEK");
    await expect(dlg.getByLabel("Amount", { exact: true })).toHaveValue("540.00");
    await dlg.getByLabel("Merchant (optional)").fill("Rail Co");
    await dlg.getByRole("button", { name: "Save changes" }).click();
    await expect(dlg).toHaveCount(0);
    expect((await storedFinance<Record<string, unknown>>(spaceId, "expenses"))[0]).toMatchObject({ amount: "540.00", currency: "SEK", merchant: "Rail Co" });
  });

  test("delete asks first and names the expense; confirming removes it and focuses the list heading", async ({ page, context }, info) => {
    const { spaceId } = await setup(context, info);
    await seedExpenses(spaceId, [GROCERIES, TRAIN]);
    await page.goto("/expenses");
    await page.getByRole("button", { name: "Groceries, €64.20, 12 Nov 2026" }).click();
    const dlg = dialogOf(page, "Edit expense");
    await dlg.getByRole("button", { name: "Delete expense" }).click();
    const alert = page.getByRole("alertdialog", { name: "Delete this expense?" });
    await expect(alert).toContainText("Groceries, €64.20, 12 Nov 2026. It cannot be undone.");
    await expect(alert.getByRole("button", { name: "Keep expense" })).toBeFocused();
    await snap(page, info, "confirm-delete", { view: true });
    await alert.getByRole("button", { name: "Delete expense" }).click();
    await expect(alert).toHaveCount(0);
    await expect(toastText(page)).toContainText("Expense deleted.");
    await expect(rowsOf(page)).toHaveCount(1);
    await expect(rowsOf(page)).toContainText("Train tickets");
    // Focus goes to the list heading, not to the removed row.
    await expect(page.getByRole("heading", { name: "Your expenses" })).toBeFocused();
    expect((await storedFinance<{ description: string }>(spaceId, "expenses")).map((e) => e.description)).toEqual(["Train tickets"]);
  });

  test("a failed delete keeps the alert open with the error; Keep expense leaves everything alone", async ({ page, context }, info) => {
    const { me, spaceId } = await setup(context, info);
    await seedExpenses(spaceId, [GROCERIES]);
    await page.goto("/expenses");
    await page.getByRole("button", { name: "Groceries, €64.20, 12 Nov 2026" }).click();
    await dialogOf(page, "Edit expense").getByRole("button", { name: "Delete expense" }).click();
    const alert = page.getByRole("alertdialog", { name: "Delete this expense?" });
    await failFinance(me, { save: true });
    await alert.getByRole("button", { name: "Delete expense" }).click();
    await expect(alert.getByTestId("form-message").first()).toContainText("Something went wrong. Try again in a moment.");
    await expect(alert).toBeVisible();
    await failFinance(me, { save: false });
    await alert.getByRole("button", { name: "Keep expense" }).click();
    await expect(alert).toHaveCount(0);
    await expect(dialogOf(page, "Edit expense")).toBeVisible();
    expect(await storedFinance(spaceId, "expenses")).toHaveLength(1);
  });
});
