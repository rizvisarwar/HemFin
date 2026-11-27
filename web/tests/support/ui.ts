import { expect, type BrowserContext, type Locator, type Page, type TestInfo } from "@playwright/test";
import { seed, seedHouseholds, selectSpace, signInAs, uniqueUser, userIdFor } from "./auth";

// Helpers shared by the finance specs (expenses, income): screenshots, layout checks and a signed-in
// user with a personal space or a household.

export const LEE = "The Lee family";

/**
 * Screenshots of one state in light and dark, under
 * test-results/screenshots/<folder>/<phone|tablet|desktop>/<state>-<light|dark>.png.
 */
export async function snap(page: Page, info: TestInfo, folder: string, name: string, opts: { view?: boolean } = {}) {
  // Buttons stay disabled until the page has hydrated, and look dimmed: wait for that to pass.
  await page.waitForFunction(() => document.querySelectorAll("button:disabled").length === 0, null, { timeout: 3000 }).catch(() => {});
  for (const scheme of ["light", "dark"] as const) {
    await page.emulateMedia({ colorScheme: scheme });
    if (scheme === "dark") await expect(page.locator("html")).toHaveClass(/dark/);
    else await expect(page.locator("html")).not.toHaveClass(/dark/);
    await page.mouse.move(0, 0); // no control captured in its hover state
    await page.screenshot({
      path: `test-results/screenshots/${folder}/${info.project.name}/${name}-${scheme}.png`,
      fullPage: !opts.view,
      animations: "disabled",
    });
  }
  await page.emulateMedia({ colorScheme: "light" });
}

export async function expectNoHorizontalScroll(page: Page) {
  const { scrollWidth, clientWidth } = await page.evaluate(() => ({
    scrollWidth: document.documentElement.scrollWidth,
    clientWidth: document.documentElement.clientWidth,
  }));
  expect(scrollWidth).toBeLessThanOrEqual(clientWidth);
}

/** Every visible link, button and form control inside `scope` is at least 44 px tall. */
export async function expectAllTapTargets(scope: Locator) {
  const targets = await scope.locator("a[href], button, input:not([type=hidden]):not([type=checkbox]), select, textarea").all();
  for (const t of targets) {
    if (!(await t.isVisible())) continue;
    const box = await t.boundingBox();
    const label = (await t.innerText().catch(() => "")) || (await t.getAttribute("aria-label")) || (await t.getAttribute("id")) || "control";
    expect(box!.height, `"${label.slice(0, 40)}" height`).toBeGreaterThanOrEqual(44);
  }
}

export const isPhone = (page: Page) => (page.viewportSize()?.width ?? 1280) < 768;
export const heading1 = (page: Page, name: string | RegExp) => page.getByRole("heading", { level: 1, name });
export const dialogOf = (page: Page, name: string) => page.getByRole("dialog", { name });
export const toastText = (page: Page) => page.getByTestId("toast");

/** Signs in as the test's own user (Alex Lee). With `household`, the household (with Jordan Kim) is the active space. */
export async function setup(context: BrowserContext, info: TestInfo, opts: { household?: boolean } = {}) {
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

/** Fills a date input or picks an option in a select. */
async function put(control: Locator, value: string) {
  const tag = await control.evaluate((el) => el.tagName);
  if (tag === "SELECT") await control.selectOption(value);
  else await control.fill(value);
}

/** Sets a list filter: in the row from md up, in the sheet on phone (`apply` is the sheet's primary button). */
export async function setFilter(page: Page, apply: string, label: string, value: string) {
  if (isPhone(page)) {
    await page.getByTestId("filters-button").click();
    const sheet = page.getByRole("dialog", { name: "Filters" });
    await put(sheet.getByLabel(label, { exact: true }), value);
    await sheet.getByRole("button", { name: apply }).click();
    await expect(sheet).toHaveCount(0);
  } else {
    await put(page.getByTestId("filter-row").getByLabel(label, { exact: true }), value);
  }
}
