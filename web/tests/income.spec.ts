import { expect, test, type Page } from "@playwright/test";
import {
  failFinance,
  failLists,
  isoIn,
  seedEntries,
  seedSources,
  storedFinance,
  type SeedEntry,
  type SeedSource,
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

// HEM-022: income sources and entries (docs/design/finance.md section 6), against the mock backend.
// Screenshots land in test-results/screenshots/hem024/<phone|tablet|desktop>/<state>-<light|dark>.png.

const snap = (page: Page, info: Parameters<typeof snapTo>[1], name: string, opts: { view?: boolean } = {}) => snapTo(page, info, "hem024", name, opts);
const entriesOf = (page: Page) => page.getByTestId(isPhone(page) ? "entry-card" : "entry-row");
const sourcesOf = (page: Page) => page.getByTestId(isPhone(page) ? "source-card" : "source-row");
const filter = (page: Page, label: string, value: string) => setFilter(page, "Show income", label, value);

const SALARY: SeedSource = { name: "Northwind Ltd", type: "salary", amount: "2850.00", frequency: "monthly" };
const DESIGN: SeedSource = { name: "Freelance design", type: "business", amount: "600.00", frequency: "irregular", active: false };
const PAY: SeedEntry = { description: "November pay", amount: "2850.00", received_on: "2026-11-28" };
const INVOICE: SeedEntry = {
  description: "Invoice 14",
  amount: "600.00",
  currency: "USD",
  received_on: "2026-11-16",
};

test.describe.configure({ timeout: 120_000 });

test.describe("income sources", () => {
  test("empty: one add button; add a source, with Active checked, and see it listed", async ({ page, context }, info) => {
    const { spaceId } = await setup(context, info);
    await page.goto("/income/sources");
    await expect(heading1(page, "Income")).toBeVisible();
    await expect(page.getByRole("link", { name: "Sources" })).toHaveAttribute("aria-current", "page");
    await expect(page.getByRole("heading", { name: "No income sources yet" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Add a source" })).toHaveCount(1);
    await expect(page.getByTestId("add-source")).toHaveCount(0);
    await expect(page.getByRole("link", { name: "Record a one-off payment instead" })).toHaveAttribute("href", "/income?new=1");
    await expectNoHorizontalScroll(page);
    await snap(page, info, "sources-empty");

    await page.getByRole("button", { name: "Add a source" }).click();
    const dlg = dialogOf(page, "Add a source");
    await expect(dlg.getByLabel("Name", { exact: true })).toBeFocused();
    await expect(dlg.getByLabel("Type")).toHaveValue("salary");
    await expect(dlg.getByLabel("How often")).toHaveValue("monthly");
    await expect(dlg.getByLabel("Active")).toBeChecked();
    await expect(dlg.getByText("Turn off to pause this source. Its payments stay in your list.")).toBeVisible();
    await expect(dlg.getByLabel("Amount", { exact: true })).toBeVisible();
    await snap(page, info, "source-form-empty", { view: true });

    await dlg.getByLabel("Name", { exact: true }).fill("Northwind Ltd");
    await dlg.getByLabel("Amount", { exact: true }).fill("2850,00");
    await snap(page, info, "source-form-filled", { view: true });
    await dlg.getByRole("button", { name: "Save source" }).click();
    await expect(dlg).toHaveCount(0);
    await expect(toastText(page)).toContainText("Source saved.");
    await expect(sourcesOf(page)).toHaveCount(1);
    await expect(sourcesOf(page)).toContainText("Northwind Ltd");
    await expect(sourcesOf(page)).toContainText("2 850,00 kr");
    await expect(sourcesOf(page)).toContainText("a month");
    await expect(sourcesOf(page)).toContainText("Active");
    expect((await storedFinance(spaceId, "sources"))[0]).toMatchObject({ name: "Northwind Ltd", type: "salary", amount: "2850.00", currency: "SEK", frequency: "monthly", active: true, member_user_id: null });
    await expectNoHorizontalScroll(page);
  });

  test("focus goes to the list heading after the first add from an empty list", async ({ page, context }, info) => {
    await setup(context, info);
    await page.goto("/income/sources");
    await page.getByRole("button", { name: "Add a source" }).click();
    const dlg = dialogOf(page, "Add a source");
    await dlg.getByLabel("Name", { exact: true }).fill("Side job");
    await dlg.getByLabel("Amount", { exact: true }).fill("300");
    await dlg.getByRole("button", { name: "Save source" }).click();
    await expect(dlg).toHaveCount(0);
    await expect(sourcesOf(page)).toHaveCount(1);
    await expect(page.getByRole("heading", { name: "Your income sources" })).toBeFocused();
  });

  test("switching space shows the skeleton, then only the new space's sources", async ({ page, context }, info) => {
    const { me, spaceId, personalId } = await setup(context, info, { household: true });
    await seedSources(personalId, [{ ...SALARY, name: "Personal job" }]);
    await seedSources(spaceId, [{ ...SALARY, name: "Household job" }]);
    await page.goto("/income/sources");
    await expect(sourcesOf(page)).toContainText("Household job");
    await failLists(me, { delay_ms: 2500 });
    await page.getByRole("button", { name: /^Active space/ }).click();
    await page.getByRole("menuitemradio", { name: /Personal/ }).click();
    await expect(page.getByTestId("sources-loading")).toBeVisible();
    await expect(page.getByText("Household job")).toHaveCount(0);
    await expect(sourcesOf(page)).toContainText("Personal job", { timeout: 15_000 });
    await expect(sourcesOf(page)).toHaveCount(1);
  });

  test("the list: type and frequency, an irregular source says 'typical amount', a paused one says Paused", async ({ page, context }, info) => {
    const { spaceId } = await setup(context, info);
    await seedSources(spaceId, [SALARY, DESIGN]);
    await page.goto("/income/sources");
    await expect(sourcesOf(page)).toHaveCount(2);
    const salary = sourcesOf(page).filter({ hasText: "Northwind Ltd" });
    const design = sourcesOf(page).filter({ hasText: "Freelance design" });
    await expect(salary).toContainText("Salary");
    await expect(salary).toContainText("Active");
    await expect(design).toContainText("Business");
    await expect(design).toContainText("typical amount");
    await expect(design).toContainText("600,00 kr");
    await expect(design).toContainText("Paused");
    await expectNoHorizontalScroll(page);
    await expectAllTapTargets(page.locator("main"));

    const width = page.viewportSize()!.width;
    if (width === 768) {
      // Five columns do not fit 648 px: Type and How often move into the Name cell (nothing is lost).
      await expect(page.getByRole("columnheader")).toHaveText(["Name", "Amount", "Status"]);
      await expect(salary).toContainText("Salary · Monthly");
    } else if (width >= 1280) {
      await expect(page.getByRole("columnheader")).toHaveText(["Name", "Type", "How often", "Amount", "Status"]);
      await expect(salary.getByText("Salary · Monthly")).toBeHidden();
    }
    await snap(page, info, "sources-list");
  });

  test("edit: Active off pauses the source; the typical amount label follows 'Irregular'; amounts keep their digits", async ({ page, context }, info) => {
    const { spaceId } = await setup(context, info);
    await seedSources(spaceId, [SALARY]);
    await page.goto("/income/sources");
    await page.getByRole("button", { name: "Northwind Ltd, 2 850,00 kr, active" }).click();
    const dlg = dialogOf(page, "Edit source");
    await expect(dlg.getByLabel("Name", { exact: true })).toHaveValue("Northwind Ltd");
    await expect(dlg.getByLabel("Amount", { exact: true })).toHaveValue("2850,00");
    await expect(dlg.getByLabel("Active")).toBeChecked();
    await dlg.getByLabel("How often").selectOption("irregular");
    await expect(dlg.getByLabel("Typical amount")).toBeVisible();
    await dlg.getByLabel("Active").uncheck();
    await snap(page, info, "source-form-edit", { view: true });
    await dlg.getByRole("button", { name: "Save source" }).click();
    await expect(dlg).toHaveCount(0);
    await expect(toastText(page)).toContainText("Source saved.");
    await expect(sourcesOf(page)).toContainText("Paused");
    await expect(sourcesOf(page)).toContainText("typical amount");
    expect((await storedFinance(spaceId, "sources"))[0]).toMatchObject({ amount: "2850.00", frequency: "irregular", active: false });
    await expect(page.getByRole("heading", { name: "Your income sources" })).toBeFocused();
  });

  test("validation: a name and an amount are required, with the spec's messages", async ({ page, context }, info) => {
    const { spaceId } = await setup(context, info);
    await seedSources(spaceId, [SALARY]);
    await page.goto("/income/sources");
    await page.getByTestId("add-source").click();
    const dlg = dialogOf(page, "Add a source");
    await dlg.getByRole("button", { name: "Save source" }).click();
    await expect(dlg.getByText("Enter a name for the source.")).toBeVisible();
    await expect(dlg.getByText("Enter the amount.")).toBeVisible();
    await expect(dlg.getByLabel("Name", { exact: true })).toBeFocused();
    await snap(page, info, "source-form-errors", { view: true });
    expect(await storedFinance(spaceId, "sources")).toHaveLength(1);
  });

  test("delete asks first; the received payments stay, without the link", async ({ page, context }, info) => {
    const { spaceId } = await setup(context, info);
    const { ids } = await seedSources(spaceId, [SALARY, DESIGN]);
    await seedEntries(spaceId, [{ ...PAY, source_id: ids[0] }]);
    await page.goto("/income/sources");
    await page.getByRole("button", { name: "Northwind Ltd, 2 850,00 kr, active" }).click();
    await dialogOf(page, "Edit source").getByRole("button", { name: "Delete source" }).click();
    const alert = page.getByRole("alertdialog", { name: "Delete Northwind Ltd?" });
    await expect(alert).toContainText("Its received payments stay in your list, but they are no longer linked to this source.");
    await expect(alert.getByRole("button", { name: "Keep source" })).toBeFocused();
    await snap(page, info, "source-confirm-delete", { view: true });
    await alert.getByRole("button", { name: "Delete source" }).click();
    await expect(toastText(page)).toContainText("Source deleted.");
    await expect(sourcesOf(page)).toHaveCount(1);
    await expect(page.getByRole("heading", { name: "Your income sources" })).toBeFocused();
    expect((await storedFinance<{ source_id: string | null }>(spaceId, "entries"))[0].source_id).toBeNull();
  });

  test("loading, error with Retry, and a household source says who it is for", async ({ page, context }, info) => {
    const { me, spaceId, jordanId } = await setup(context, info, { household: true });
    await seedSources(spaceId, [{ ...SALARY, member_user_id: jordanId }]);
    await failLists(me, { delay_ms: 4000 });
    await page.goto("/income/sources");
    await expect(page.getByTestId("sources-loading")).toBeVisible();
    await snap(page, info, "sources-loading", { view: true });
    await failLists(me, { delay_ms: 0 });
    await expect(page.getByTestId("sources-list")).toBeVisible({ timeout: 15_000 });
    await expect(sourcesOf(page)).toContainText("For Jordan Kim");

    await failFinance(me, { list: true });
    await page.reload();
    await expect(page.getByTestId("sources-error")).toContainText("We could not load your income sources just now.");
    await snap(page, info, "sources-error");
    await failFinance(me, { list: false });
    await page.getByRole("button", { name: "Retry" }).click();
    await expect(page.getByTestId("sources-list")).toBeVisible();
  });
});

test.describe("income entries", () => {
  test("focus goes to the list heading after the first add from an empty list", async ({ page, context }, info) => {
    await setup(context, info);
    await page.goto("/income");
    await page.getByRole("button", { name: "Add income" }).click();
    const dlg = dialogOf(page, "Add income");
    await dlg.getByLabel("Amount", { exact: true }).fill("40");
    await dlg.getByRole("button", { name: "Save income" }).click();
    await expect(dlg).toHaveCount(0);
    await expect(entriesOf(page)).toHaveCount(1);
    await expect(page.getByRole("heading", { name: "Your income" })).toBeFocused();
  });

  test("switching space shows the skeleton, then only the new space's income", async ({ page, context }, info) => {
    const { me, spaceId, personalId } = await setup(context, info, { household: true });
    await seedEntries(personalId, [{ ...PAY, description: "Personal pay" }]);
    await seedEntries(spaceId, [{ ...PAY, description: "Household pay" }]);
    await page.goto("/income");
    await expect(entriesOf(page)).toContainText("Household pay");
    await failLists(me, { delay_ms: 2500 });
    await page.getByRole("button", { name: /^Active space/ }).click();
    await page.getByRole("menuitemradio", { name: /Personal/ }).click();
    await expect(page.getByTestId("income-loading")).toBeVisible();
    await expect(page.getByText("Household pay")).toHaveCount(0);
    await expect(entriesOf(page)).toContainText("Personal pay", { timeout: 15_000 });
    await expect(entriesOf(page)).toHaveCount(1);
  });

  test("empty state with the secondary link, then add a payment linked to a source", async ({ page, context }, info) => {
    const { spaceId } = await setup(context, info);
    const { ids } = await seedSources(spaceId, [SALARY, DESIGN]);
    await page.goto("/income");
    await expect(heading1(page, "Income")).toBeVisible();
    await expect(page.getByRole("link", { name: "Entries" })).toHaveAttribute("aria-current", "page");
    await expect(page.getByRole("heading", { name: "No income recorded" })).toBeVisible();
    await expect(page.getByRole("link", { name: "Set up a regular source" })).toHaveAttribute("href", "/income/sources");
    await expect(page.getByRole("button", { name: "Add income" })).toHaveCount(1);
    await expectNoHorizontalScroll(page);
    await snap(page, info, "entries-empty");

    await page.getByRole("button", { name: "Add income" }).click();
    const dlg = dialogOf(page, "Add income");
    await expect(dlg.getByLabel("Amount", { exact: true })).toBeFocused();
    await expect(dlg.getByLabel("Received on")).toHaveValue(isoIn(0));
    // A paused source is still offered, marked as paused (6.2).
    await expect(dlg.getByLabel("From source (optional)").locator("option")).toHaveText(["No source", "Northwind Ltd", "Freelance design (paused)"]);
    await snap(page, info, "entry-form-empty", { view: true });
    await dlg.getByLabel("Amount", { exact: true }).fill("2850,00");
    await dlg.getByLabel("From source (optional)").selectOption(ids[0]);
    await dlg.getByLabel("Description (optional)").fill("November pay");
    await snap(page, info, "entry-form-filled", { view: true });
    await dlg.getByRole("button", { name: "Save income" }).click();
    await expect(dlg).toHaveCount(0);
    await expect(toastText(page)).toContainText("Income added.");
    await expect(entriesOf(page)).toHaveCount(1);
    // A plus sign and the word "Income" show the direction (F13).
    await expect(entriesOf(page)).toContainText("+2 850,00 kr");
    await expect(entriesOf(page)).toContainText("November pay");
    expect((await storedFinance(spaceId, "entries"))[0]).toMatchObject({ amount: "2850.00", currency: "SEK", source_id: ids[0], description: "November pay", received_on: isoIn(0) });
  });

  test("grouped by month; direction, source type, converted amount (no extra plus) and no overflow", async ({ page, context }, info) => {
    const { spaceId } = await setup(context, info);
    const { ids } = await seedSources(spaceId, [SALARY]);
    await seedEntries(spaceId, [
      { ...PAY, source_id: ids[0] },
      INVOICE,
      { description: "Refund", amount: "20.00", received_on: "2026-10-03" },
    ]);
    await page.goto("/income");
    await expect(entriesOf(page)).toHaveCount(3);
    await expect(page.getByRole("heading", { level: 2, name: "November 2026" })).toBeVisible();
    await expect(page.getByRole("heading", { level: 2, name: "October 2026" })).toBeVisible();
    await expect(page.getByText("2 payments")).toBeVisible();
    const pay = entriesOf(page).filter({ hasText: "November pay" });
    await expect(pay).toContainText("+2 850,00 kr");
    await expect(pay).toContainText("Income");
    const invoice = entriesOf(page).filter({ hasText: "Invoice 14" });
    await expect(invoice).toContainText("+600,00 USD");
    await expect(invoice).not.toContainText("About");
    await expect(invoice).not.toContainText("+EUR");
    // The source's type is in the meta line; from xl the Source column names the source instead.
    await expect(pay).toContainText((page.viewportSize()?.width ?? 0) >= 1280 ? "Northwind Ltd" : "Salary");
    if (isPhone(page)) await expect(entriesOf(page).filter({ hasText: "Refund" })).toContainText("No source");
    await expect(page.getByRole("button", { name: "November pay, +2 850,00 kr, 28 nov. 2026" })).toBeVisible();
    await expectNoHorizontalScroll(page);
    await expectAllTapTargets(page.locator("main"));
    await snap(page, info, "entries-populated");
  });

  test("an entry without a description is titled by its source", async ({ page, context }, info) => {
    const { spaceId } = await setup(context, info);
    const { ids } = await seedSources(spaceId, [SALARY]);
    await seedEntries(spaceId, [{ amount: "100.00", source_id: ids[0] }]);
    await page.goto("/income");
    await expect(entriesOf(page)).toContainText("Northwind Ltd");
  });

  test("edit saves changes and moves focus to the heading; delete asks first and names the amount", async ({ page, context }, info) => {
    const { spaceId } = await setup(context, info);
    await seedEntries(spaceId, [PAY, INVOICE]);
    await page.goto("/income");
    await page.getByRole("button", { name: "November pay, +2 850,00 kr, 28 nov. 2026" }).click();
    const dlg = dialogOf(page, "Edit income");
    await expect(dlg.getByLabel("Amount", { exact: true })).toHaveValue("2850,00");
    await expect(dlg.getByLabel("Received on")).toHaveValue("2026-11-28");
    await expect(dlg.getByLabel("Description (optional)")).toHaveValue("November pay");
    await snap(page, info, "entry-form-edit", { view: true });
    await dlg.getByLabel("Amount", { exact: true }).fill("2900.50");
    await dlg.getByRole("button", { name: "Save income" }).click();
    await expect(dlg).toHaveCount(0);
    await expect(toastText(page)).toContainText("Income saved.");
    await expect(entriesOf(page).filter({ hasText: "November pay" })).toContainText("+2 900,50 kr");
    await expect(page.getByRole("heading", { name: "Your income" })).toBeFocused();

    await page.getByRole("button", { name: "Invoice 14, +600,00 USD, 16 nov. 2026" }).click();
    await dialogOf(page, "Edit income").getByRole("button", { name: "Delete income" }).click();
    const alert = page.getByRole("alertdialog", { name: "Delete this income?" });
    await expect(alert).toContainText("600,00 USD from 16 nov. 2026. It cannot be undone.");
    await expect(alert.getByRole("button", { name: "Keep income" })).toBeFocused();
    await snap(page, info, "entry-confirm-delete", { view: true });
    await alert.getByRole("button", { name: "Delete income" }).click();
    await expect(toastText(page).filter({ hasText: "Income deleted." })).toBeVisible();
    await expect(entriesOf(page)).toHaveCount(1);
    await expect(page.getByRole("heading", { name: "Your income" })).toBeFocused();
    expect((await storedFinance<{ description: string }>(spaceId, "entries")).map((e) => e.description)).toEqual(["November pay"]);
  });

  test("validation: the date and amount messages, and a date more than a day ahead", async ({ page, context }, info) => {
    const { spaceId } = await setup(context, info);
    await page.goto("/income");
    await page.getByRole("button", { name: "Add income" }).click();
    const dlg = dialogOf(page, "Add income");
    await dlg.getByLabel("Received on").fill("");
    await dlg.getByRole("button", { name: "Save income" }).click();
    await expect(dlg.getByText("Enter the amount.")).toBeVisible();
    await expect(dlg.getByText("Enter the date you received it.")).toBeVisible();
    await expect(dlg.getByLabel("Amount", { exact: true })).toBeFocused();
    await dlg.getByLabel("Amount", { exact: true }).fill("10");
    await dlg.getByLabel("Received on").fill(isoIn(2));
    await dlg.getByRole("button", { name: "Save income" }).click();
    await expect(dlg.getByText("The date cannot be more than a day in the future.")).toBeVisible();
    expect(await storedFinance(spaceId, "entries")).toHaveLength(0);
  });

  test("filters: From and To (inclusive) and Source", async ({ page, context }, info) => {
    const { spaceId } = await setup(context, info);
    const { ids } = await seedSources(spaceId, [SALARY, DESIGN]);
    await seedEntries(spaceId, [
      { description: "A", received_on: "2026-11-28", source_id: ids[0] },
      { description: "B", received_on: "2026-11-16", source_id: ids[1] },
      { description: "C", received_on: "2026-10-03" },
    ]);
    await page.goto("/income");
    await expect(entriesOf(page)).toHaveCount(3);
    await filter(page, "From", "2026-11-16");
    await expect(entriesOf(page)).toHaveCount(2);
    await filter(page, "To", "2026-11-16");
    await expect(entriesOf(page)).toHaveCount(1);
    await expect(entriesOf(page)).toContainText("B");
    await filter(page, "From", "");
    await filter(page, "To", "");
    await expect(entriesOf(page)).toHaveCount(3);
    await filter(page, "Source", ids[0]);
    await expect(entriesOf(page)).toHaveCount(1);
    await expect(entriesOf(page)).toContainText("A");
    await snap(page, info, "entries-filtered");
    await filter(page, "Source", ids[1]);
    await filter(page, "From", "2026-11-20");
    await expect(page.getByTestId("no-match")).toContainText("No matching income");
    await page.getByTestId("no-match").getByRole("button", { name: "Clear filters" }).click();
    await expect(entriesOf(page)).toHaveCount(3);
  });

  test("Show more income loads the next page", async ({ page, context }, info) => {
    const { spaceId } = await setup(context, info);
    await seedEntries(spaceId, Array.from({ length: 27 }, (_, i) => ({ description: `Payment ${String(i + 1).padStart(2, "0")}`, received_on: "2026-11-15" })));
    await page.goto("/income");
    await expect(entriesOf(page)).toHaveCount(25);
    await page.getByRole("button", { name: "Show more income" }).click();
    await expect(entriesOf(page)).toHaveCount(27);
    await expect(page.getByRole("button", { name: "Show more income" })).toHaveCount(0);
  });

  test("loading and error states", async ({ page, context }, info) => {
    const { me, spaceId } = await setup(context, info);
    await seedEntries(spaceId, [PAY]);
    await failLists(me, { delay_ms: 4000 });
    await page.goto("/income");
    await expect(page.getByTestId("income-loading")).toBeVisible();
    await snap(page, info, "entries-loading", { view: true });
    await failLists(me, { delay_ms: 0 });
    await expect(page.getByTestId("income-list")).toBeVisible({ timeout: 15_000 });
    await failFinance(me, { list: true });
    await page.reload();
    await expect(page.getByTestId("income-error")).toContainText("We could not load your income just now.");
    await snap(page, info, "entries-error");
    await failFinance(me, { list: false });
    await page.getByRole("button", { name: "Retry" }).click();
    await expect(page.getByTestId("income-list")).toBeVisible();
  });

  test("a household form offers Applies to; a household list says who the payment is for", async ({ page, context }, info) => {
    const { spaceId, jordanId } = await setup(context, info, { household: true });
    await seedEntries(spaceId, [{ ...PAY, member_user_id: jordanId }]);
    await page.goto("/income");
    await expect(entriesOf(page)).toContainText("Jordan Kim");
    await page.getByRole("button", { name: "Add income" }).click();
    const dlg = dialogOf(page, "Add income");
    await expect(dlg.getByLabel("Applies to (optional)").locator("option")).toHaveText(["Whole household", "Alex Lee", "Jordan Kim"]);
    await dlg.getByLabel("Amount", { exact: true }).fill("15");
    await dlg.getByLabel("Applies to (optional)").selectOption(jordanId);
    await dlg.getByRole("button", { name: "Save income" }).click();
    await expect(dlg).toHaveCount(0);
    const stored = await storedFinance<{ member_user_id: string | null; amount: string }>(spaceId, "entries");
    expect(stored.find((e) => e.amount === "15")?.member_user_id).toBe(jordanId);
  });

  test("the form fits the screen: no horizontal scroll and 44 px controls", async ({ page, context }, info) => {
    await setup(context, info, { household: true });
    await page.goto("/income");
    await page.getByRole("button", { name: "Add income" }).click();
    const dlg = dialogOf(page, "Add income");
    await expect(dlg.getByLabel("Amount", { exact: true })).toBeVisible(); // the form, not the loading dialog before it
    await expectNoHorizontalScroll(page);
    await expectAllTapTargets(dlg);
    await dlg.getByRole("button", { name: "Cancel" }).click();
    await page.goto("/income/sources");
    await page.getByRole("button", { name: "Add a source" }).click();
    await expect(dialogOf(page, "Add a source").getByLabel("Name", { exact: true })).toBeVisible();
    await expectAllTapTargets(dialogOf(page, "Add a source"));
    await expectNoHorizontalScroll(page);
  });

  test("a failed save shows a message at the top and keeps the values", async ({ page, context }, info) => {
    const { me, spaceId } = await setup(context, info);
    await page.goto("/income");
    await page.getByRole("button", { name: "Add income" }).click();
    const dlg = dialogOf(page, "Add income");
    await dlg.getByLabel("Amount", { exact: true }).fill("55");
    await failFinance(me, { save: true });
    await dlg.getByRole("button", { name: "Save income" }).click();
    await expect(dlg.getByTestId("form-message").first()).toContainText("Something went wrong. Try again in a moment.");
    await expect(dlg.getByLabel("Amount", { exact: true })).toHaveValue("55");
    await failFinance(me, { save: false });
    await dlg.getByRole("button", { name: "Save income" }).click();
    await expect(dlg).toHaveCount(0);
    expect(await storedFinance(spaceId, "entries")).toHaveLength(1);
  });
});
