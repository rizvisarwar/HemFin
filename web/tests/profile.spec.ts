import { expect, test, type Locator, type Page, type TestInfo } from "@playwright/test";
import { apiHits, seed, signInAs, uniqueUser } from "./support/auth";

// HEM-011: profile page and addresses, against the mock backend (tests/support/mock-backend.mjs).
// Each test signs in as its own user, so parallel tests never share profile or address state.

async function expectNoHorizontalScroll(page: Page) {
  const { scrollWidth, clientWidth } = await page.evaluate(() => ({
    scrollWidth: document.documentElement.scrollWidth,
    clientWidth: document.documentElement.clientWidth,
  }));
  expect(scrollWidth).toBeLessThanOrEqual(clientWidth);
}

async function shot(page: Page, info: TestInfo, name: string) {
  // Move the pointer off the page first, so no button is captured in its hover state.
  await page.mouse.move(0, 0);
  await page.screenshot({
    path: `test-results/screenshots/${info.project.name}-profile-${name}.png`,
    fullPage: true,
    animations: "disabled",
  });
}

/** Screenshot of what is on screen now (for a dialog or sheet, which fullPage would stretch). */
async function viewShot(page: Page, info: TestInfo, name: string) {
  await page.mouse.move(0, 0);
  await page.screenshot({ path: `test-results/screenshots/${info.project.name}-profile-${name}.png`, animations: "disabled" });
}

async function expectTapTarget(el: Locator, what: string) {
  const box = await el.boundingBox();
  expect(box, `${what} is visible`).not.toBeNull();
  expect(box!.height, `${what} height`).toBeGreaterThanOrEqual(44);
}

/** Opens /profile signed in as this test's own user, and waits until the forms are hydrated. */
async function openProfile(page: Page, info: TestInfo, context: Parameters<typeof signInAs>[0], data: Parameters<typeof seed>[1] = {}) {
  const user = uniqueUser(info);
  await seed(user, data);
  await signInAs(context, user);
  await page.goto("/profile");
  await expect(page.getByRole("heading", { level: 1, name: "Profile" })).toBeVisible();
  await expect(page.getByTestId("save-profile")).toBeEnabled();
  return user;
}

const SEEDED = {
  display_name: "Sam Example",
  profile: { phone_e164: "+31612345678", base_currency: "EUR", locale: "en" },
};

const HOME = { label: "Home", line1: "Main Street 1", postcode: "3511 AB", city: "Utrecht", country: "NL" };
const WORK = { label: "Work", line1: "Station Road 12", line2: "Floor 3", city: "London", region: "Greater London", postcode: "EC1A 1BB", country: "GB" };

const phoneInput = (page: Page) => page.locator("#phone");
const message = (page: Page) => page.locator("#profile-form-message");

async function pickCurrency(page: Page, search: string, option: RegExp) {
  const input = page.getByLabel("Base currency");
  await input.fill(search);
  await page.getByRole("option", { name: option }).first().click();
}

test.describe("profile form", () => {
  test("loads the saved values, read-only email, and fits every viewport", async ({ page, context }, info) => {
    const user = await openProfile(page, info, context, SEEDED);
    await expect(page.getByLabel("Display name")).toHaveValue("Sam Example");
    const email = page.getByLabel("Email", { exact: true });
    await expect(email).toHaveValue(user.email);
    await expect(email).toHaveAttribute("readonly", "");
    await expect(email).not.toHaveAttribute("name", /.+/); // never part of a form post
    await expect(page.getByText("Changing it is not available yet")).toBeVisible();
    await expect(page.getByLabel("Phone country")).toHaveValue("Netherlands (+31)");
    await expect(phoneInput(page)).toHaveValue("612345678");
    await expect(page.getByLabel("Base currency")).toHaveValue("EUR");
    await expect(page.getByLabel("Locale")).toHaveValue("en");
    // Money in the base currency and locale.
    await expect(page.getByTestId("money-example")).toHaveText("€1,240.50");
    await expectNoHorizontalScroll(page);
    await shot(page, info, "populated-light");
    await page.emulateMedia({ colorScheme: "dark" });
    await expect(page.locator("html")).toHaveClass(/dark/);
    await expectNoHorizontalScroll(page);
    await shot(page, info, "populated-dark");
  });

  test("a new user sees the defaults", async ({ page, context }, info) => {
    await openProfile(page, info, context);
    await expect(page.getByLabel("Display name")).toHaveValue("");
    await expect(page.getByLabel("Base currency")).toHaveValue("EUR");
    await expect(phoneInput(page)).toHaveValue("");
    await expect(page.getByTestId("addresses").getByText("No addresses yet")).toBeVisible();
    await shot(page, info, "empty-light");
    await page.emulateMedia({ colorScheme: "dark" });
    await expect(page.locator("html")).toHaveClass(/dark/);
    await shot(page, info, "empty-dark");
  });

  test("form controls are at least 44 px tall", async ({ page, context }, info) => {
    await openProfile(page, info, context, SEEDED);
    const targets: [Locator, string][] = [
      [page.getByLabel("Display name"), "display name"],
      [page.getByLabel("Phone country"), "phone country"],
      [phoneInput(page), "phone"],
      [page.getByLabel("Base currency"), "currency"],
      [page.getByLabel("Locale"), "locale"],
      [page.getByTestId("save-profile"), "save"],
    ];
    for (const [el, what] of targets) await expectTapTarget(el, what);
  });

  test("saves, shows inline success, and the values persist after a reload", async ({ page, context }, info) => {
    await openProfile(page, info, context, SEEDED);
    await page.getByLabel("Display name").fill("Sam Q. Example");
    await phoneInput(page).fill("06 98765432");
    await pickCurrency(page, "dollar", /^US Dollar/);
    await expect(page.getByLabel("Base currency")).toHaveValue("USD");
    await page.getByLabel("Locale").selectOption("nl-NL");
    await page.getByTestId("save-profile").click();

    await expect(message(page)).toHaveText("Profile saved.");
    await expect(message(page)).toHaveAttribute("aria-live", "polite");
    // The API's normalised value comes back into the form, and the layout re-reads the profile,
    // so money is now written with the new currency and locale.
    await expect(phoneInput(page)).toHaveValue("698765432");
    await expect(page.getByTestId("money-example")).toHaveText(/1\.240,50/);
    await shot(page, info, "saved");

    await page.reload();
    await expect(page.getByTestId("save-profile")).toBeEnabled();
    await expect(page.getByLabel("Display name")).toHaveValue("Sam Q. Example");
    await expect(page.getByLabel("Base currency")).toHaveValue("USD");
    await expect(page.getByLabel("Locale")).toHaveValue("nl-NL");
    await expect(page.getByLabel("Phone country")).toHaveValue("Netherlands (+31)");
    await expect(phoneInput(page)).toHaveValue("698765432");
    await expect(page.getByTestId("money-example")).toContainText("US$");
  });

  test("the API's 422 for the phone shows on the field, takes focus and is announced", async ({ page, context }, info) => {
    await openProfile(page, info, context, SEEDED);
    await phoneInput(page).fill("+999 123 456 789");
    await page.getByTestId("save-profile").click();
    const error = page.locator("#phone-error");
    await expect(error).toContainText("Not a valid phone number.");
    await expect(error).toHaveAttribute("aria-live", "polite");
    await expect(phoneInput(page)).toHaveAttribute("aria-invalid", "true");
    await expect(phoneInput(page)).toHaveAttribute("aria-describedby", /phone-error/);
    await expect(phoneInput(page)).toBeFocused();
    await expect(message(page)).toHaveText(""); // no false success
    await expectNoHorizontalScroll(page);
    await shot(page, info, "phone-error-light");
    await page.emulateMedia({ colorScheme: "dark" });
    await expect(page.locator("html")).toHaveClass(/dark/);
    await shot(page, info, "phone-error-dark");

    // Fixing it saves.
    await phoneInput(page).fill("6 12345678");
    await page.getByTestId("save-profile").click();
    await expect(message(page)).toHaveText("Profile saved.");
    await expect(page.locator("#phone-error")).toHaveText("");
  });

  test("clearing the phone number clears it on the server", async ({ page, context }, info) => {
    await openProfile(page, info, context, SEEDED);
    await phoneInput(page).fill("");
    await page.getByTestId("save-profile").click();
    await expect(message(page)).toHaveText("Profile saved.");
    await page.reload();
    await expect(page.getByTestId("save-profile")).toBeEnabled();
    await expect(phoneInput(page)).toHaveValue("");
  });

  test("an unknown currency is caught before sending, with focus on that field", async ({ page, context }, info) => {
    await openProfile(page, info, context, SEEDED);
    const currency = page.getByLabel("Base currency");
    await currency.fill("ZZZ9");
    await page.getByLabel("Display name").click(); // closes the list and leaves the text as typed
    await page.getByTestId("save-profile").click();
    await expect(page.locator("#base_currency-error")).toContainText("Choose a currency from the list.");
    await expect(currency).toHaveAttribute("aria-invalid", "true");
    await expect(currency).toBeFocused();
  });

  test("the currency picker searches by code or name and works with the keyboard", async ({ page, context }, info) => {
    await openProfile(page, info, context, SEEDED);
    const currency = page.getByLabel("Base currency");
    await currency.fill("swiss");
    const list = page.getByRole("listbox", { name: "Currencies" }); // named, not "Options"
    await expect(list.getByRole("option")).toHaveCount(1);
    await expect(currency).toHaveAttribute("aria-controls", "base_currency-list");
    await expect(list.getByRole("option").first()).toContainText("Swiss Franc");
    await currency.fill("gbp");
    await expect(list.getByRole("option").first()).toContainText("British Pound");
    await currency.fill("qqqq");
    // "No match" is a message outside the listbox; there is no list to point aria-controls at.
    await expect(page.getByTestId("combobox-empty")).toContainText("No match");
    await expect(page.getByRole("listbox")).toHaveCount(0);
    await expect(currency).not.toHaveAttribute("aria-controls", /.+/);
    await currency.fill("pound");
    const second = await list.getByRole("option").nth(1).locator("span").last().innerText(); // its code
    await currency.press("ArrowDown");
    await expect(currency).toHaveAttribute("aria-activedescendant", /base_currency-opt-1/);
    await currency.press("ArrowDown");
    await currency.press("ArrowUp");
    await currency.press("Enter");
    await expect(currency).toHaveValue(second);
    await expect(page.getByRole("listbox")).toHaveCount(0);
    // Enter in the picker picks; it does not submit the form.
    await expect(message(page)).toHaveText("");
  });

  test("a server error that is not about one field is shown for the whole form", async ({ page, context }, info) => {
    await openProfile(page, info, context, SEEDED);
    // A locale the API rejects (the select cannot send one, so bypass the control).
    await page.getByLabel("Locale").evaluate((el: HTMLSelectElement) => {
      el.add(new Option("bad", "not a locale"));
      el.value = "not a locale";
    });
    await page.getByTestId("save-profile").click();
    await expect(page.locator("#locale-error")).toContainText("BCP-47");
    await expect(page.getByLabel("Locale")).toBeFocused();
  });

  test("the delete-account placeholder cannot be actioned", async ({ page, context }, info) => {
    await openProfile(page, info, context, SEEDED);
    const button = page.getByRole("button", { name: "Delete account (coming soon)" });
    await expect(button).toBeVisible();
    await expect(button).toBeDisabled();
    await expect(button).toHaveAccessibleDescription(/not available yet/);
  });
});

test.describe("before JavaScript is ready", () => {
  test("a submit without JavaScript puts no form value in the URL and the button is disabled", async ({ page, context }, info) => {
    const user = uniqueUser(info);
    await seed(user, SEEDED);
    await signInAs(context, user);
    await page.route("**/_next/static/**", (route) => route.abort());
    await page.goto("/profile");
    const form = page.getByTestId("profile-form");
    await expect(form).toBeVisible();
    await expect(form.locator('button[type="submit"]')).toBeDisabled();
    await expect(form).toHaveAttribute("method", "post");
    await page.getByLabel("Display name").fill("leak-check-name");
    await phoneInput(page).fill("0699999999");
    // requestSubmit() bypasses the disabled button: the worst case. The form posts to the page, which
    // is a full navigation we can wait for.
    const navigated = page.waitForEvent("framenavigated", (frame) => frame === page.mainFrame());
    await form.evaluate((f) => (f as HTMLFormElement).requestSubmit());
    await navigated;
    await page.waitForLoadState("load");
    const url = page.url();
    expect(new URL(url).search, `ended at ${url}`).toBe("");
    expect(decodeURIComponent(url)).not.toContain("leak-check");
    expect(url).not.toContain("0699999999");
  });

  test("the only form on the page before JavaScript is the profile form (addresses use buttons, not forms)", async ({ page, context }, info) => {
    const user = uniqueUser(info);
    await seed(user, { ...SEEDED, addresses: [HOME] });
    await signInAs(context, user);
    await page.route("**/_next/static/**", (route) => route.abort());
    await page.goto("/profile");
    await expect(page.getByTestId("address-card")).toBeVisible();
    await expect(page.locator("main form")).toHaveCount(1);
    for (const button of await page.getByTestId("addresses").getByRole("button").all()) {
      await expect(button).toHaveAttribute("type", "button");
    }
  });

  test("text typed before hydration survives it", async ({ page, context }, info) => {
    // WebKit keeps streamed (Suspense) content hidden until the page's scripts have loaded, so while
    // they are held back there is no field to type into. Chromium shows the form first, which is the
    // case this test covers. (The no-script test above runs on every project, WebKit included.)
    test.skip(info.project.name === "phone", "WebKit does not reveal streamed content before its scripts load");
    const user = uniqueUser(info);
    await seed(user, SEEDED);
    await signInAs(context, user);
    let release: () => void = () => {};
    const gate = new Promise<void>((resolve) => (release = resolve));
    await page.route("**/_next/static/**/*.js", async (route) => {
      await gate;
      await route.continue();
    });
    await page.goto("/profile", { waitUntil: "domcontentloaded" });
    const name = page.getByLabel("Display name");
    await name.fill("Typed Early");
    await phoneInput(page).fill("655500011");
    const save = page.getByTestId("save-profile");
    await expect(save).toBeDisabled();
    release();
    await expect(save).toBeEnabled();
    await expect(name).toHaveValue("Typed Early");
    await expect(phoneInput(page)).toHaveValue("655500011");
  });
});

test.describe("addresses", () => {
  test("empty state, then the first address becomes the default", async ({ page, context }, info) => {
    await openProfile(page, info, context);
    const section = page.getByTestId("addresses");
    await expect(section.getByText("No addresses yet")).toBeVisible();
    await section.getByRole("button", { name: "Add address" }).click();

    const dialog = page.getByRole("dialog", { name: "Add address" });
    await expect(dialog).toBeVisible();
    await expect(page.getByRole("dialog").getByLabel("Name", { exact: true })).toBeFocused();
    await expect(dialog.getByText("Your first address becomes your default address.")).toBeVisible();

    // Empty submit: inline errors, focus on the first invalid field.
    await dialog.getByTestId("save-address").click();
    await expect(page.locator("#label-error")).toContainText("Give the address a name");
    await expect(page.locator("#line1-error")).toContainText("Enter the street and number.");
    await expect(page.locator("#city-error")).toBeVisible();
    await expect(page.locator("#country-error")).toContainText("Choose a country.");
    await expect(page.getByRole("dialog").getByLabel("Name", { exact: true })).toBeFocused();
    await expect(page.getByRole("dialog").getByLabel("Name", { exact: true })).toHaveAttribute("aria-invalid", "true");
    await expect(page.locator("#label-error")).toHaveAttribute("aria-live", "polite");
    await viewShot(page, info, "address-dialog-errors");

    await page.getByRole("dialog").getByLabel("Name", { exact: true }).fill(HOME.label);
    await page.getByRole("dialog").getByLabel("Street and number", { exact: true }).fill(HOME.line1);
    await page.getByRole("dialog").getByLabel("Postcode", { exact: true }).fill(HOME.postcode);
    await page.getByRole("dialog").getByLabel("City", { exact: true }).fill(HOME.city);
    await page.getByRole("dialog").getByLabel("Country", { exact: true }).fill("nether");
    await page.getByRole("option", { name: /^Netherlands/ }).click();
    await expect(page.getByRole("dialog").getByLabel("Country", { exact: true })).toHaveValue("Netherlands");
    await viewShot(page, info, "address-dialog-filled");
    await dialog.getByTestId("save-address").click();

    await expect(dialog).toBeHidden();
    const cards = page.getByTestId("address-card");
    await expect(cards).toHaveCount(1);
    await expect(cards.first()).toContainText("Home");
    await expect(cards.first()).toContainText("3511 AB Utrecht");
    await expect(cards.first()).toContainText("Netherlands");
    await expect(cards.first().getByText("Default", { exact: true })).toBeVisible();
    await expect(page.locator("#addresses-message")).toHaveText("Address added.");
    await expect(section.getByText("No addresses yet")).toHaveCount(0);
  });

  test("add a second address, make it the default, edit and delete with confirmation", async ({ page, context }, info) => {
    test.slow(); // a long journey: triple the default timeout keeps it stable under parallel load
    await openProfile(page, info, context, { addresses: [HOME] });
    const section = page.getByTestId("addresses");
    const cards = page.getByTestId("address-card");
    await expect(cards).toHaveCount(1);

    // Add, as the default.
    await section.getByRole("button", { name: "Add address" }).click();
    const add = page.getByRole("dialog", { name: "Add address" });
    await page.getByRole("dialog").getByLabel("Name", { exact: true }).fill(WORK.label);
    await page.getByRole("dialog").getByLabel("Street and number", { exact: true }).fill(WORK.line1);
    await page.getByRole("dialog").getByLabel("Address line 2 (optional)", { exact: true }).fill(WORK.line2);
    await page.getByRole("dialog").getByLabel("Postcode", { exact: true }).fill(WORK.postcode);
    await page.getByRole("dialog").getByLabel("City", { exact: true }).fill(WORK.city);
    await page.getByRole("dialog").getByLabel("Region (optional)", { exact: true }).fill(WORK.region);
    await page.getByRole("dialog").getByLabel("Country", { exact: true }).fill("united kingdom");
    await page.getByRole("option", { name: /^United Kingdom/ }).click();
    await add.getByLabel("Make this my default address").check();
    await add.getByTestId("save-address").click();
    await expect(add).toBeHidden();
    await expect(cards).toHaveCount(2);
    // The default is listed first, with its badge.
    await expect(cards.first()).toContainText("Work");
    await expect(cards.first().getByText("Default", { exact: true })).toBeVisible();
    await expect(cards.nth(1).getByText("Default", { exact: true })).toHaveCount(0);
    await expect(cards.first()).toContainText("Greater London");

    // Set the other one as default.
    await page.getByRole("button", { name: "Set as default: Home" }).click();
    await expect(page.locator("#addresses-message")).toHaveText("Home is now your default address.");
    await expect(cards.first()).toContainText("Home");
    await expect(cards.first().getByText("Default", { exact: true })).toBeVisible();
    await expect(page.getByRole("button", { name: "Set as default: Home" })).toHaveCount(0);
    await shot(page, info, "addresses-populated-light");
    await page.emulateMedia({ colorScheme: "dark" });
    await expect(page.locator("html")).toHaveClass(/dark/);
    await shot(page, info, "addresses-populated-dark");
    await page.emulateMedia({ colorScheme: "light" });

    // Edit.
    await page.getByRole("button", { name: "Edit Work" }).click();
    const edit = page.getByRole("dialog", { name: "Edit address" });
    await expect(page.getByRole("dialog").getByLabel("Name", { exact: true })).toHaveValue("Work");
    await expect(page.getByRole("dialog").getByLabel("Country", { exact: true })).toHaveValue("United Kingdom");
    await expect(edit.getByLabel("Make this my default address")).toHaveCount(0);
    await page.getByRole("dialog").getByLabel("Name", { exact: true }).fill("Office");
    await page.getByRole("dialog").getByLabel("Address line 2 (optional)", { exact: true }).fill("");
    await edit.getByTestId("save-address").click();
    await expect(edit).toBeHidden();
    await expect(page.locator("#addresses-message")).toHaveText("Address saved.");
    await expect(cards.filter({ hasText: "Office" })).toBeVisible();
    await expect(cards.filter({ hasText: "Office" })).not.toContainText("Floor 3");

    // Delete: cancel keeps it, confirm removes it.
    await page.getByRole("button", { name: "Delete Office" }).click();
    const confirm = page.getByRole("alertdialog", { name: "Delete this address?" });
    await expect(confirm).toBeVisible();
    await expect(confirm).toContainText("Office will be removed");
    await expect(confirm.getByRole("button", { name: "Cancel" })).toBeFocused(); // the safe choice has focus
    await viewShot(page, info, "delete-dialog-light");
    await page.emulateMedia({ colorScheme: "dark" });
    await expect(page.locator("html")).toHaveClass(/dark/);
    await viewShot(page, info, "delete-dialog-dark");
    await page.emulateMedia({ colorScheme: "light" });
    await confirm.getByRole("button", { name: "Cancel" }).click();
    await expect(confirm).toBeHidden();
    await expect(cards).toHaveCount(2);

    await page.getByRole("button", { name: "Delete Office" }).click();
    await confirm.getByTestId("confirm-delete").click();
    await expect(confirm).toBeHidden();
    await expect(cards).toHaveCount(1);
    await expect(page.locator("#addresses-message")).toHaveText("Office was deleted.");
    await expect(page.getByRole("heading", { name: "Addresses" })).toBeFocused(); // focus does not fall to the page body
  });

  test("deleting the default address does not promote another one", async ({ page, context }, info) => {
    await openProfile(page, info, context, { addresses: [HOME, WORK] });
    const cards = page.getByTestId("address-card");
    await page.getByRole("button", { name: "Delete Home" }).click();
    const confirm = page.getByRole("alertdialog");
    await expect(confirm).toContainText("is your default address");
    await confirm.getByTestId("confirm-delete").click();
    await expect(cards).toHaveCount(1);
    await expect(page.getByText("Default", { exact: true })).toHaveCount(0);
  });

  test("the delete dialog is a bottom sheet on phone and a centred dialog on larger screens", async ({ page, context }, info) => {
    await openProfile(page, info, context, { addresses: [HOME] });
    await page.getByRole("button", { name: "Delete Home" }).click();
    const dialog = page.getByRole("alertdialog");
    await expect(dialog).toBeVisible();
    const box = (await dialog.boundingBox())!;
    const view = page.viewportSize()!;
    if (info.project.name === "phone") {
      expect(Math.round(box.x)).toBe(0);
      expect(Math.round(box.width)).toBe(view.width);
      expect(Math.round(box.y + box.height)).toBe(view.height); // docked to the bottom edge
    } else {
      expect(box.width).toBeLessThanOrEqual(448);
      expect(Math.abs(box.x + box.width / 2 - view.width / 2)).toBeLessThan(2); // centred
      expect(box.y).toBeGreaterThan(0);
      expect(box.y + box.height).toBeLessThan(view.height);
    }
    for (const name of ["Cancel", "Delete address", "Close"]) {
      await expectTapTarget(dialog.getByRole("button", { name }), name);
    }
    // Escape closes it.
    await page.keyboard.press("Escape");
    await expect(dialog).toBeHidden();
  });

  test("cards stack on phone and sit in two columns from tablet up; nothing scrolls sideways", async ({ page, context }, info) => {
    const long = { label: "A".repeat(40), line1: "B".repeat(90), city: "C".repeat(60), country: "NL" };
    await openProfile(page, info, context, { addresses: [HOME, WORK, long] });
    const cards = page.getByTestId("address-card");
    await expect(cards).toHaveCount(3);
    const a = (await cards.nth(0).boundingBox())!;
    const b = (await cards.nth(1).boundingBox())!;
    if (info.project.name === "phone") {
      expect(Math.abs(a.x - b.x)).toBeLessThan(2); // one column
      expect(b.y).toBeGreaterThan(a.y + a.height - 1);
    } else {
      expect(b.x).toBeGreaterThan(a.x + a.width - 1); // second column
      expect(Math.abs(a.y - b.y)).toBeLessThan(2);
    }
    await expectNoHorizontalScroll(page);
    for (const card of await cards.all()) {
      for (const button of await card.getByRole("button").all()) await expectTapTarget(button, "address action");
    }
    await expectTapTarget(page.getByTestId("addresses").getByRole("button", { name: "Add address" }), "add address");
  });

  test("the 20-address cap: the API's 409 shows a friendly message", async ({ page, context }, info) => {
    const user = await openProfile(page, info, context, { addresses: 19 });
    const section = page.getByTestId("addresses");
    await expect(page.getByTestId("address-card")).toHaveCount(19);
    await section.getByRole("button", { name: "Add address" }).click();
    const dialog = page.getByRole("dialog", { name: "Add address" });
    await page.getByRole("dialog").getByLabel("Name", { exact: true }).fill("Twentieth");
    await page.getByRole("dialog").getByLabel("Street and number", { exact: true }).fill("Last Street 20");
    await page.getByRole("dialog").getByLabel("City", { exact: true }).fill("Utrecht");
    await page.getByRole("dialog").getByLabel("Country", { exact: true }).fill("netherlands");
    await page.getByRole("option", { name: /^Netherlands/ }).click();
    // Another tab fills the 20th slot while this dialog is open.
    await seed(user, { addresses: 20 });
    await dialog.getByTestId("save-address").click();
    const error = dialog.getByTestId("form-message");
    await expect(error).toContainText("limit of 20 addresses");
    await expect(error).toHaveAttribute("role", "alert");
    await expect(dialog).toBeVisible(); // nothing is lost: the user can still cancel and tidy up
    await viewShot(page, info, "address-limit-409");
  });

  test("with 20 addresses the add button is disabled and says why", async ({ page, context }, info) => {
    await openProfile(page, info, context, { addresses: 20 });
    const section = page.getByTestId("addresses");
    await expect(section.getByRole("button", { name: "Add address" })).toBeDisabled();
    await expect(page.getByTestId("address-limit")).toContainText("limit of 20 addresses");
    await expectNoHorizontalScroll(page);
    await shot(page, info, "addresses-at-limit");
  });

  test("a failed delete keeps the dialog open with the reason", async ({ page, context }, info) => {
    await openProfile(page, info, context, { addresses: [HOME] });
    await page.route("**/api/v1/me/addresses/*", (route) =>
      route.request().method() === "DELETE"
        ? route.fulfill({ status: 500, headers: { "access-control-allow-origin": "*" }, contentType: "application/problem+json", body: JSON.stringify({ status: 500, title: "Internal Server Error" }) })
        : route.continue(),
    );
    await page.getByRole("button", { name: "Delete Home" }).click();
    const confirm = page.getByRole("alertdialog");
    await confirm.getByTestId("confirm-delete").click();
    await expect(confirm.getByTestId("form-message")).toContainText("Something went wrong");
    await expect(page.getByTestId("address-card")).toHaveCount(1);
  });
});

test.describe("review round 1", () => {
  test("Escape closes an open country list first, then the dialog; typed text stays", async ({ page, context }, info) => {
    await openProfile(page, info, context, { addresses: [HOME] });
    await page.getByTestId("addresses").getByRole("button", { name: "Add address" }).click();
    const dialog = page.getByRole("dialog", { name: "Add address" });
    const country = dialog.getByLabel("Country", { exact: true });
    await country.fill("nether");
    await expect(dialog.getByRole("listbox", { name: "Countries" })).toBeVisible();
    await country.press("Escape");
    await expect(dialog.getByRole("listbox")).toHaveCount(0);
    await expect(dialog).toBeVisible(); // the first Escape only closed the list
    await expect(country).toHaveValue("nether");
    await country.press("Escape"); // the list is closed now, so this one reaches the dialog
    await expect(dialog).toBeHidden();
  });

  test("the country and currency lists are fully visible and scrollable inside the bottom sheet", async ({ page, context }, info) => {
    await openProfile(page, info, context, { addresses: [HOME] });
    await page.getByTestId("addresses").getByRole("button", { name: "Add address" }).click();
    const dialog = page.getByRole("dialog", { name: "Add address" });
    const country = dialog.getByLabel("Country", { exact: true });
    await country.fill("a");
    const list = dialog.getByRole("listbox", { name: "Countries" });
    await list.scrollIntoViewIfNeeded();
    const view = page.viewportSize()!;
    const box = (await list.boundingBox())!;
    const scroller = await list.evaluate((el) => {
      const r = (el.parentElement!.closest(".overflow-y-auto") as HTMLElement).getBoundingClientRect();
      return { top: r.top, bottom: r.bottom };
    });
    expect(box.x).toBeGreaterThanOrEqual(0);
    expect(box.x + box.width).toBeLessThanOrEqual(view.width);
    // Inside the visible part of the sheet's scroll area, not hidden behind the pinned footer or cut off.
    expect(box.y).toBeGreaterThanOrEqual(scroller.top - 1);
    expect(box.y + box.height).toBeLessThanOrEqual(scroller.bottom + 1);
    expect(box.y + box.height).toBeLessThanOrEqual(view.height);
    // Every option can be reached by scrolling the list: the last one becomes visible and can be picked.
    expect(await list.evaluate((el) => el.scrollHeight > el.clientHeight)).toBe(true);
    await list.evaluate((el) => (el.scrollTop = el.scrollHeight));
    const last = list.getByRole("option").last();
    await expect(last).toBeInViewport();
    await last.click();
    await expect(country).not.toHaveValue("a");
    await expect(dialog).toBeVisible();
    await viewShot(page, info, "country-list-in-sheet");

    // The currency list on the page, with the same checks against the viewport.
    await dialog.getByRole("button", { name: "Cancel" }).click();
    const currency = page.getByLabel("Base currency");
    await currency.fill("a");
    const currencies = page.getByRole("listbox", { name: "Currencies" });
    await currencies.scrollIntoViewIfNeeded();
    const cbox = (await currencies.boundingBox())!;
    expect(cbox.x + cbox.width).toBeLessThanOrEqual(view.width);
    await currencies.evaluate((el) => (el.scrollTop = el.scrollHeight));
    await expect(currencies.getByRole("option").last()).toBeInViewport();
  });

  test("the phone country comes from the locale's region, the same on server and client", async ({ page, context }, info) => {
    await openProfile(page, info, context, { profile: { locale: "nl-NL" } });
    await expect(page.getByLabel("Phone country")).toHaveValue("Netherlands (+31)");
  });

  test("with no region in the locale the country is empty and must be chosen", async ({ page, context }, info) => {
    await openProfile(page, info, context, { profile: { locale: "en" } });
    await expect(page.getByLabel("Phone country")).toHaveValue("");
    await phoneInput(page).fill("6 12345678");
    await page.getByTestId("save-profile").click();
    await expect(page.locator("#phone-error")).toContainText("Choose the country this number belongs to.");
    await expect(phoneInput(page)).toBeFocused();
    await page.getByLabel("Phone country").fill("netherlands");
    await page.getByRole("option", { name: /^Netherlands/ }).click();
    await page.getByTestId("save-profile").click();
    await expect(message(page)).toHaveText("Profile saved.");
  });

  test("a stored number with an unlisted calling code is shown whole and survives a save", async ({ page, context }, info) => {
    await openProfile(page, info, context, { profile: { phone_e164: "+80012345678", locale: "en" } });
    await expect(phoneInput(page)).toHaveValue("+80012345678");
    await page.getByLabel("Display name").fill("Changed name");
    await page.getByTestId("save-profile").click();
    await expect(message(page)).toHaveText("Profile saved.");
    await page.reload();
    await expect(page.getByTestId("save-profile")).toBeEnabled();
    await expect(page.getByLabel("Display name")).toHaveValue("Changed name");
    await expect(phoneInput(page)).toHaveValue("+80012345678"); // not cleared
  });

  test("a number typed with a leading 00 is read as international", async ({ page, context }, info) => {
    await openProfile(page, info, context, SEEDED);
    await phoneInput(page).fill("0044 20 7946 0958");
    await page.getByTestId("save-profile").click();
    await expect(message(page)).toHaveText("Profile saved.");
    await expect(page.getByLabel("Phone country")).toHaveValue("United Kingdom (+44)");
    await expect(phoneInput(page)).toHaveValue("2079460958");
  });

  test("the money example follows the currency being picked", async ({ page, context }, info) => {
    await openProfile(page, info, context, SEEDED);
    const example = page.getByTestId("money-example");
    await expect(example).toHaveText("€1,240.50");
    await pickCurrency(page, "swiss", /^Swiss Franc/);
    await expect(example).toContainText("CHF"); // before saving
    await expect(example).toContainText("1,240.50");
  });

  test("a display name is counted in characters, not UTF-16 units", async ({ page, context }, info) => {
    await openProfile(page, info, context, SEEDED);
    await page.getByLabel("Display name").fill("\u{1F600}".repeat(80)); // 80 characters, 160 UTF-16 units
    await page.getByTestId("save-profile").click();
    await expect(message(page)).toHaveText("Profile saved.");
    await page.getByLabel("Display name").fill("\u{1F600}".repeat(81));
    await page.getByTestId("save-profile").click();
    await expect(page.locator("#display_name-error")).toContainText("Use at most 80 characters.");
  });

  test("the page does not fetch the profile or the user twice", async ({ page, context }, info) => {
    const user = await openProfile(page, info, context, SEEDED);
    await page.waitForLoadState("networkidle");
    const hits = await apiHits(user);
    expect(hits["GET /api/v1/me/profile"]).toBe(1);
    expect(hits["GET /api/v1/me"]).toBe(1);
  });

  test("the header has no space badge, and the empty state title is an h3", async ({ page, context }, info) => {
    await openProfile(page, info, context);
    await expect(page.locator('[data-slot="page-header"]').getByText("Personal")).toHaveCount(0);
    await expect(page.getByRole("heading", { level: 3, name: "No addresses yet" })).toBeVisible();
    await expect(page.getByRole("heading", { level: 2, name: "Addresses" })).toBeVisible();
  });

  test("set-as-default has an accessible name that starts with its visible text", async ({ page, context }, info) => {
    await openProfile(page, info, context, { addresses: [HOME, WORK] });
    const button = page.getByRole("button", { name: "Set as default: Work" });
    await expect(button).toHaveText("Set as default");
    await expect(button).toBeVisible();
  });

  test("on phone an address card shows a two-line summary", async ({ page, context }, info) => {
    test.skip(info.project.name !== "phone", "the compact summary is phone-only");
    await openProfile(page, info, context, { addresses: [WORK] });
    const summary = page.getByTestId("address-card").locator("address .line-clamp-2");
    await expect(summary).toBeVisible();
    await expect(summary).toHaveText("Station Road 12, Floor 3, EC1A 1BB London, Greater London, United Kingdom");
    await expect(summary).toHaveCSS("-webkit-line-clamp", "2");
  });

  test("a failed profile load shows an alert with Retry, and Retry loads the page", async ({ page, context }, info) => {
    const user = uniqueUser(info);
    await seed(user, { ...SEEDED, fail_profile: true });
    await signInAs(context, user);
    await page.goto("/profile");
    const alert = page.getByRole("alert").filter({ hasText: "We could not load your profile" });
    await expect(alert).toBeVisible();
    const retry = alert.getByRole("button", { name: "Retry" });
    await expectTapTarget(retry, "retry");
    await shot(page, info, "load-error");
    await seed(user, { fail_profile: false });
    await retry.click();
    await expect(page.getByTestId("profile-form")).toBeVisible();
    await expect(page.getByLabel("Display name")).toHaveValue("Sam Example");
  });

  test("the whole page and the edit dialog, in light and dark", async ({ page, context }, info) => {
    await openProfile(page, info, context, { ...SEEDED, addresses: [HOME, WORK] });
    await expectNoHorizontalScroll(page);
    await shot(page, info, "full-light");
    await page.emulateMedia({ colorScheme: "dark" });
    await expect(page.locator("html")).toHaveClass(/dark/);
    await shot(page, info, "full-dark");
    await page.getByRole("button", { name: "Edit Home" }).click();
    await viewShot(page, info, "edit-dialog-dark");
    await page.keyboard.press("Escape");
    await page.emulateMedia({ colorScheme: "light" });
    await expect(page.locator("html")).not.toHaveClass(/dark/);
    await page.getByRole("button", { name: "Edit Home" }).click();
    await viewShot(page, info, "edit-dialog-light");
  });
});
