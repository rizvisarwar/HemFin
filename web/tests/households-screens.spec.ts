import { expect, test, type BrowserContext, type Page, type TestInfo } from "@playwright/test";
import { failLists, removeFromHousehold, seed, seedHouseholds, signInAs, uniqueUser, type SeedHousehold } from "./support/auth";

// HEM-015 design-review screenshots: every state in docs/design/households.md that this ticket
// builds, in light and dark, at the three viewports. They land in
// test-results/screenshots/hem015/<project>/<state>-<light|dark>.png and double as a check that
// each state renders. Invitations and the accept page are HEM-016.

const LEE = "The Lee family";

async function snap(page: Page, info: TestInfo, name: string, opts: { view?: boolean; folder?: string } = {}) {
  for (const scheme of ["light", "dark"] as const) {
    await page.emulateMedia({ colorScheme: scheme });
    if (scheme === "dark") await expect(page.locator("html")).toHaveClass(/dark/);
    else await expect(page.locator("html")).not.toHaveClass(/dark/);
    await page.mouse.move(0, 0); // no button captured in its hover state
    await page.screenshot({
      path: `test-results/screenshots/hem015/${opts.folder ?? info.project.name}/${name}-${scheme}.png`,
      fullPage: !opts.view,
      animations: "disabled",
    });
  }
  await page.emulateMedia({ colorScheme: "light" });
}

function cast(info: TestInfo) {
  const me = uniqueUser(info);
  const base = me.email.replace("@example.test", "");
  return {
    me,
    owner: { email: `owner.${base}@example.test`, display_name: "Casey Owner", role: "owner" as const },
    jordan: { email: `jordan.${base}@example.test`, display_name: "Jordan Kim", role: "admin" as const },
    sam: { email: `sam.${base}@example.test`, display_name: "Sam Lee", role: "member" as const },
  };
}

async function setup(context: BrowserContext, info: TestInfo, households: SeedHousehold[]) {
  const { me } = cast(info);
  await seed(me, { display_name: "Alex Lee" });
  const seeded = await seedHouseholds(me, households);
  await signInAs(context, me);
  return { me, ids: seeded.ids };
}

// A long walk through many states, in two colour schemes each: allow for slow WebKit runs.
test.describe.configure({ timeout: 120_000 });

test.describe("household screens", () => {
  test("household list: populated and error", async ({ page, context }, info) => {
    const { owner, jordan, sam } = cast(info);
    const { me } = await setup(context, info, [
      { name: LEE, role: "owner", members: [jordan, sam], extra_members: 1 },
      { name: "Lee cousins with a longer name that wraps onto a second line", role: "member", members: [owner] },
    ]);
    await page.goto("/household");
    await expect(page.getByTestId("household-list")).toBeVisible();
    await snap(page, info, "list-populated");

    await failLists(me, { spaces: true });
    await page.goto("/household");
    await expect(page.getByTestId("list-error")).toBeVisible();
    await snap(page, info, "list-error");
  });

  // Loading states need the page's streamed skeleton to stay visible while the API is slow. WebKit
  // keeps streamed content hidden until the stream ends, so these run in Chromium (the tablet
  // project) and are captured at all three widths.
  test("loading skeletons: list and members, at 375, 768 and 1280", async ({ page, context }, info) => {
    test.skip(info.project.name !== "tablet", "WebKit hides streamed fallbacks until the stream ends");
    const { me, ids } = await setup(context, info, [{ name: LEE, role: "owner" }]);
    await failLists(me, { delay_ms: 5000 });
    for (const width of [375, 768, 1280]) {
      await page.setViewportSize({ width, height: width === 375 ? 812 : width === 768 ? 1024 : 800 });
      await page.goto("/household", { waitUntil: "commit" });
      await expect(page.getByTestId("list-loading")).toBeVisible();
      await snap(page, info, "list-loading", { folder: `loading-${width}` });
      await page.goto(`/household/${ids[0]}/members`, { waitUntil: "commit" });
      await expect(page.getByTestId("members-loading")).toBeVisible();
      await snap(page, info, "members-loading", { folder: `loading-${width}` });
    }
  });

  test("household list: empty", async ({ page, context }, info) => {
    await setup(context, info, []);
    await page.goto("/household");
    await expect(page.getByRole("heading", { name: "Share finances with family" })).toBeVisible();
    await snap(page, info, "list-empty");
  });

  test("create: idle, validation error, limit reached, busy and the created toast", async ({ page, context }, info) => {
    const { me } = await setup(context, info, []);
    await page.goto("/household/new");
    await expect(page.getByTestId("create-household")).toBeEnabled();
    await snap(page, info, "create-idle");

    const name = page.locator("#name");
    await name.fill("   ");
    await name.blur();
    await expect(page.getByText("Enter a name for the household.")).toBeVisible();
    await snap(page, info, "create-error-empty");
    await name.fill("x".repeat(64));
    await expect(page.getByTestId("name-counter")).toBeVisible();
    await snap(page, info, "create-counter");

    await failLists(me, { delay_ms: 5000 });
    await name.fill(LEE);
    await page.getByTestId("create-household").click();
    await expect(page.getByRole("button", { name: "Creating…" })).toBeVisible();
    await snap(page, info, "create-busy", { view: true });
    await expect(page.getByTestId("toast")).toBeVisible({ timeout: 15_000 });
    await snap(page, info, "create-success-toast", { view: true });
  });

  test("create: limit reached", async ({ page, context }, info) => {
    await setup(
      context,
      info,
      Array.from({ length: 10 }, (_, i) => ({ name: `Owned ${i + 1}`, role: "owner" as const })),
    );
    await page.goto("/household/new");
    await page.locator("#name").fill("One too many");
    await page.getByTestId("create-household").click();
    await expect(page.locator("#create-form-message")).toContainText("You can own up to 10 households");
    await snap(page, info, "create-limit");
  });

  test("members: owner, admin and member views, and the dialogs", async ({ page, context }, info) => {
    const { owner, jordan, sam } = cast(info);
    const { ids, me } = await setup(context, info, [
      { name: LEE, role: "owner", members: [jordan, sam] },
      { name: "Lee cousins", role: "admin", members: [owner, sam] },
      { name: "Sam's flat", role: "member", members: [owner] },
      { name: "Just me", role: "owner" },
    ]);
    // Owner view, with the role dialog, remove and transfer alerts.
    await page.goto(`/household/${ids[0]}/members`);
    await expect(page.getByRole("heading", { name: "Members (3)" })).toBeVisible();
    await snap(page, info, "members-owner");

    await page.getByRole("button", { name: "Change role for Sam Lee" }).click();
    await expect(page.getByRole("dialog", { name: "Change role for Sam Lee" })).toBeVisible();
    await snap(page, info, "dialog-change-role", { view: true });
    await page.getByRole("dialog").getByRole("button", { name: "Transfer ownership" }).click();
    await expect(page.getByRole("alertdialog")).toBeVisible();
    await snap(page, info, "dialog-transfer", { view: true });
    await page.getByRole("alertdialog").getByRole("button", { name: "Cancel" }).click();

    await page.getByRole("button", { name: "Remove Sam Lee" }).click();
    await expect(page.getByRole("alertdialog", { name: "Remove Sam Lee?" })).toBeVisible();
    await snap(page, info, "dialog-remove", { view: true });
    await page.getByRole("alertdialog").getByRole("button", { name: "Cancel" }).click();

    // Success message after a role change.
    await page.getByRole("button", { name: "Change role for Sam Lee" }).click();
    await page.getByRole("dialog").getByRole("radio", { name: /Admin/ }).check();
    await page.getByRole("dialog").getByRole("button", { name: "Save role" }).click();
    await expect(page.locator("#members-message")).toHaveText("Role updated for Sam Lee.");
    await snap(page, info, "members-role-changed");

    // The API refuses (Jordan is already gone): the dialog shows its message.
    await removeFromHousehold({ email: jordan.email }, ids[0]);
    await page.getByRole("button", { name: "Remove Jordan Kim" }).click();
    await page.getByRole("alertdialog").getByRole("button", { name: "Remove member" }).click();
    await expect(page.getByRole("alertdialog")).toContainText("Member not found.");
    await snap(page, info, "dialog-remove-error", { view: true });
    await page.getByRole("alertdialog").getByRole("button", { name: "Cancel" }).click();

    // Busy dialog.
    await failLists(me, { delay_ms: 4000 });
    await page.getByRole("button", { name: "Remove Sam Lee" }).click();
    await page.getByRole("alertdialog").getByRole("button", { name: "Remove member" }).click();
    await expect(page.getByRole("button", { name: "Removing…" })).toBeVisible();
    await snap(page, info, "dialog-remove-busy", { view: true });
    await expect(page.locator("#members-message")).toContainText("was removed from", { timeout: 15_000 });
    await snap(page, info, "members-removed");
    await failLists(me, { delay_ms: 0 });

    // Admin view: Remove on members only.
    await page.goto(`/household/${ids[1]}/members`);
    await expect(page.getByRole("heading", { name: "Members (3)" })).toBeVisible();
    await snap(page, info, "members-admin");
    // Member view: no actions, no Invitations link.
    await page.goto(`/household/${ids[2]}/members`);
    await expect(page.getByRole("heading", { name: "Members (2)" })).toBeVisible();
    await snap(page, info, "members-member");
    // Only the owner: the invite card.
    await page.goto(`/household/${ids[3]}/members`);
    await expect(page.getByTestId("only-owner")).toBeVisible();
    await snap(page, info, "members-only-owner");
    // Invitations placeholder (HEM-016 builds the real section).
    await page.goto(`/household/${ids[3]}/invitations`);
    await expect(page.getByTestId("invitations-placeholder")).toBeVisible();
    await snap(page, info, "invitations-placeholder");
  });

  test("members: error", async ({ page, context }, info) => {
    const { me, ids } = await setup(context, info, [{ name: LEE, role: "owner" }]);
    await failLists(me, { members: true });
    await page.goto(`/household/${ids[0]}/members`);
    await expect(page.getByTestId("members-error")).toBeVisible();
    await snap(page, info, "members-error");
  });

  test("settings: owner, admin and member views, rename states and dialogs", async ({ page, context }, info) => {
    const { owner, jordan } = cast(info);
    const { ids, me } = await setup(context, info, [
      { name: LEE, role: "owner", members: [jordan] },
      { name: "Lee cousins", role: "admin", members: [owner] },
      { name: "Sam's flat", role: "member", members: [owner] },
    ]);
    await page.goto(`/household/${ids[0]}/settings`);
    await expect(page.getByTestId("save-name")).toBeVisible();
    await snap(page, info, "settings-owner");

    const input = page.locator("#household-name");
    await input.fill("");
    await input.blur();
    await expect(page.getByText("Enter a name for the household.")).toBeVisible();
    await snap(page, info, "settings-rename-error");
    await input.fill("Lee-Kim household");
    await failLists(me, { delay_ms: 4000 });
    await page.getByTestId("save-name").click();
    await expect(page.getByRole("button", { name: "Saving…" })).toBeVisible();
    await snap(page, info, "settings-rename-busy");
    await expect(page.locator("#rename-message")).toHaveText("Household name saved.", { timeout: 15_000 });
    await snap(page, info, "settings-rename-saved");
    await failLists(me, { delay_ms: 0 });

    await page.getByTestId("delete-household").click();
    const dialog = page.getByRole("alertdialog");
    await expect(dialog).toBeVisible();
    await snap(page, info, "dialog-delete", { view: true });
    await dialog.getByLabel(/^Type .* to confirm$/).fill("wrong name");
    await dialog.getByLabel(/^Type .* to confirm$/).blur();
    await expect(dialog.getByText("The name does not match.")).toBeVisible();
    await snap(page, info, "dialog-delete-mismatch", { view: true });
    await dialog.getByLabel(/^Type .* to confirm$/).fill("Lee-Kim household");
    await expect(dialog.getByRole("button", { name: "Delete household" })).toBeEnabled();
    await snap(page, info, "dialog-delete-ready", { view: true });
    await dialog.getByRole("button", { name: "Cancel" }).click();

    await page.goto(`/household/${ids[1]}/settings`);
    await expect(page.getByTestId("leave-household")).toBeEnabled();
    await snap(page, info, "settings-admin");
    await page.getByTestId("leave-household").click();
    await expect(page.getByRole("alertdialog")).toBeVisible();
    await snap(page, info, "dialog-leave", { view: true });
    await page.getByRole("alertdialog").getByRole("button", { name: "Cancel" }).click();

    await page.goto(`/household/${ids[2]}/settings`);
    await expect(page.getByTestId("readonly-name")).toBeVisible();
    await snap(page, info, "settings-member");
  });

  test("leaving shows the success message on the list", async ({ page, context }, info) => {
    const { owner } = cast(info);
    const { ids } = await setup(context, info, [{ name: LEE, role: "member", members: [owner] }]);
    await page.goto(`/household/${ids[0]}/settings`);
    await page.getByTestId("leave-household").click();
    await page.getByRole("alertdialog").getByRole("button", { name: "Leave household" }).click();
    await expect(page.locator("#flash-message")).toHaveText(`You left ${LEE}.`);
    await snap(page, info, "list-left");
  });

  test("not found", async ({ page, context }, info) => {
    await setup(context, info, []);
    await page.goto("/household/00000000-0000-4000-8000-000000000000/members");
    await expect(page.getByTestId("household-not-found")).toBeVisible();
    await snap(page, info, "not-found");
  });

  test("space switcher: only personal, with households, long names, keyboard focus", async ({ page, context }, info) => {
    const { me } = await setup(context, info, []);
    const open = async () => {
      const trigger = page.getByRole("button", { name: /^Active space/ });
      await expect(trigger).toBeEnabled();
      await trigger.click();
      await expect(page.getByRole("menu", { name: "Spaces" })).toBeVisible();
    };
    await page.goto("/dashboard");
    await open();
    await snap(page, info, "switcher-only-personal", { view: true });

    const long = "The extended Lee-Kim-Rodriguez-Papadopoulos family household of Utrecht and surroundings north of the river";
    await seedHouseholds(me, [
      { name: LEE, role: "owner" },
      { name: "Lee cousins", role: "member" },
      { name: long, role: "admin" },
    ]);
    await page.goto("/dashboard");
    await open();
    await page.keyboard.press("ArrowDown"); // focus ring on a row
    await snap(page, info, "switcher-households", { view: true });
    await page.getByRole("menuitemradio", { name: new RegExp("extended Lee-Kim") }).click();
    await expect(page.getByRole("button", { name: `Active space: ${long}. Switch space.` })).toBeVisible();
    await open();
    await snap(page, info, "switcher-long-name-active", { view: true });
  });

  test("lost access: the toast after falling back to the personal space", async ({ page, context }, info) => {
    await setup(context, info, [{ name: LEE, role: "owner" }]);
    await context.addCookies([
      { name: "hemfin-space", value: "11111111-1111-4111-8111-111111111111", url: "http://127.0.0.1:3100", httpOnly: true, sameSite: "Lax" },
    ]);
    await page.goto("/dashboard");
    await expect(page.getByTestId("toast")).toBeVisible();
    await snap(page, info, "toast-lost-access", { view: true });
  });
});
