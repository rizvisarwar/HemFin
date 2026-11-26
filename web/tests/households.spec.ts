import { expect, test, type BrowserContext, type Locator, type Page, type TestInfo } from "@playwright/test";
import {
  failLists,
  removeFromHousehold,
  seed,
  seedHouseholds,
  signInAs,
  storedSpace,
  uniqueUser,
  type SeedHousehold,
} from "./support/auth";

// HEM-015: households, members, settings and the space switcher, against the mock backend
// (tests/support/mock-backend.mjs). Each test signs in as its own user and seeds its own
// households, so parallel tests never share state.

async function expectNoHorizontalScroll(page: Page) {
  const { scrollWidth, clientWidth } = await page.evaluate(() => ({
    scrollWidth: document.documentElement.scrollWidth,
    clientWidth: document.documentElement.clientWidth,
  }));
  expect(scrollWidth).toBeLessThanOrEqual(clientWidth);
}

async function expectTapTarget(el: Locator, what: string) {
  const box = await el.boundingBox();
  expect(box, `${what} is visible`).not.toBeNull();
  expect(box!.height, `${what} height`).toBeGreaterThanOrEqual(44);
  expect(box!.width, `${what} width`).toBeGreaterThanOrEqual(44);
}

/** Every visible link, button and form control inside `scope` is at least 44 px tall. */
async function expectAllTapTargets(scope: Locator) {
  const targets = await scope.locator("a[href], button, input:not([type=hidden]), select").all();
  for (const t of targets) {
    if (!(await t.isVisible())) continue;
    const box = await t.boundingBox();
    const label = (await t.innerText().catch(() => "")) || (await t.getAttribute("aria-label")) || "control";
    expect(box!.height, `"${label.slice(0, 40)}" height`).toBeGreaterThanOrEqual(44);
  }
}

/** The per-test cast: the signed-in user plus two other members, with emails no other test uses. */
function cast(info: TestInfo) {
  const me = uniqueUser(info);
  const base = me.email.replace("@example.test", "");
  return {
    me,
    jordan: { email: `jordan.${base}@example.test`, display_name: "Jordan Kim" },
    sam: { email: `sam.${base}@example.test`, display_name: "Sam Lee" },
  };
}

/** Signs in as the test's own user (called Alex Lee) with the given households. */
async function setup(context: BrowserContext, info: TestInfo, households: SeedHousehold[], displayName = "Alex Lee") {
  const { me, jordan, sam } = cast(info);
  await seed(me, { display_name: displayName });
  const seeded = await seedHouseholds(me, households);
  await signInAs(context, me);
  return { me, jordan, sam, ids: seeded.ids, personalId: seeded.personal_id };
}

const LEE = "The Lee family";

test.describe("household list", () => {
  test("a new user sees the empty state and the personal reference card", async ({ page, context }, info) => {
    await setup(context, info, []);
    await page.goto("/household");
    await expect(page.getByRole("heading", { level: 1, name: "Households" })).toBeVisible();
    await expect(page.getByTestId("personal-card")).toContainText("Only you can see it. It is not listed here.");
    await expect(page.getByRole("heading", { name: "Share finances with family" })).toBeVisible();
    // No space is active on this list, so no space badge in the page header.
    await expect(page.locator("[data-slot=page-header] [data-space]")).toHaveCount(0);
    await expectNoHorizontalScroll(page);
    // The empty state's action (a link styled as a button) and the header's link both start the flow.
    await expect(page.getByRole("main").getByRole("link", { name: "Create a household" })).toHaveCount(1);
    await page.getByRole("main").getByRole("button", { name: "Create a household" }).click();
    await expect(page).toHaveURL(/\/household\/new$/);
  });

  test("lists households with role and member count, sorted by name, each card one link", async ({ page, context }, info) => {
    const { ids } = await setup(context, info, [
      { name: LEE, role: "owner", members: [jordan_(info), sam_(info)], extra_members: 1 },
      { name: "Lee cousins", role: "member", members: [jordan_(info)] },
    ]);
    await page.goto("/household");
    const list = page.getByTestId("household-list");
    const cards = list.getByRole("link");
    await expect(cards).toHaveCount(2);
    // Sorted by name: "Lee cousins" before "The Lee family".
    await expect(cards.nth(0)).toHaveAccessibleName("Lee cousins, Member");
    await expect(cards.nth(1)).toHaveAccessibleName(`${LEE}, Owner`);
    await expect(cards.nth(0)).toContainText("2 members");
    await expect(cards.nth(1)).toContainText("4 members");
    // The household cards are 56 px tall at least (design spec section 10).
    const box = await cards.nth(0).boundingBox();
    expect(box!.height).toBeGreaterThanOrEqual(56);
    await expectNoHorizontalScroll(page);
    await cards.nth(1).click();
    await expect(page).toHaveURL(new RegExp(`/household/${ids[0]}/members$`));
    await expect(page.getByRole("heading", { level: 1, name: LEE })).toBeVisible();
  });

  test("a load error shows a message with Retry, and Retry loads the list", async ({ page, context }, info) => {
    const { me } = await setup(context, info, [{ name: LEE }]);
    await failLists(me, { spaces: true });
    await page.goto("/household");
    const error = page.getByTestId("list-error");
    await expect(error).toContainText("We could not load your households just now.");
    await failLists(me, { spaces: false });
    await error.getByRole("button", { name: "Retry" }).click();
    await expect(page.getByTestId("household-list")).toBeVisible();
    await expect(page.getByTestId("list-error")).toHaveCount(0);
  });
});

// Small builders so the seeded cast reads the same in every test.
function jordan_(info: TestInfo): NonNullable<SeedHousehold["members"]>[number] {
  return { ...cast(info).jordan, role: "admin" };
}
function sam_(info: TestInfo): NonNullable<SeedHousehold["members"]>[number] {
  return { ...cast(info).sam, role: "member" };
}

test.describe("create a household", () => {
  test("creates it, makes it the selected space and opens its members", async ({ page, context }, info) => {
    await setup(context, info, []);
    await page.goto("/household/new");
    await expect(page.getByRole("heading", { level: 1, name: "Create a household" })).toBeVisible();
    const submit = page.getByTestId("create-household");
    await expect(submit).toBeEnabled();
    await page.locator("#name").fill(`  ${LEE}  `);
    await submit.click();

    await expect(page).toHaveURL(/\/household\/[0-9a-f-]{36}\/members$/);
    await expect(page.getByRole("heading", { level: 1, name: LEE })).toBeVisible();
    await expect(page.getByTestId("toast")).toHaveText(/Household created\./);
    // The creator is the owner, alone: the "Invite your family" card shows.
    await expect(page.getByTestId("only-owner")).toContainText("Invite your family");
    // D5: the new household is the selected space, in the shell and in the cookie.
    await expect(page.getByRole("button", { name: `Active space: ${LEE}. Switch space.` })).toBeVisible();
    await expect(page.locator("header[data-space]").first()).toHaveAttribute("data-space", "household");
    const id = /household\/([0-9a-f-]{36})\//.exec(page.url())![1];
    await expect.poll(async () => (await context.cookies()).find((c) => c.name === "hemfin-space")?.value).toBe(id);
    await expect.poll(async () => (await storedSpace(id)).name).toBe(LEE);
  });

  test("validates the name on blur and on submit, and counts characters from 60", async ({ page, context }, info) => {
    await setup(context, info, []);
    await page.goto("/household/new");
    const input = page.locator("#name");
    await expect(page.getByTestId("create-household")).toBeEnabled();

    await input.fill("   ");
    await input.blur();
    await expect(page.getByText("Enter a name for the household.")).toBeVisible();
    await expect(input).toHaveAttribute("aria-invalid", "true");

    await input.fill("x".repeat(59));
    await expect(page.getByTestId("name-counter")).toHaveCount(0);
    await input.fill("x".repeat(61));
    await expect(page.getByTestId("name-counter")).toHaveText("61 of 80 used");
    await input.fill("x".repeat(81));
    await input.press("Enter"); // submits from the keyboard, without a blur first
    await expect(page.getByText("Use at most 80 characters.")).toBeVisible();
    await expect(input).toBeFocused(); // focus moves to the invalid field
    await expect(page).toHaveURL(/\/household\/new$/);
  });

  test("shows the household limit and keeps what was typed", async ({ page, context }, info) => {
    await setup(
      context,
      info,
      Array.from({ length: 10 }, (_, i) => ({ name: `Owned ${i + 1}`, role: "owner" as const })),
    );
    await page.goto("/household/new");
    await page.locator("#name").fill("One too many");
    await page.getByTestId("create-household").click();
    await expect(page.locator("#create-form-message")).toContainText(
      "You can own up to 10 households. Transfer or delete one to create another.",
    );
    await expect(page.locator("#name")).toHaveValue("One too many");
    await expect(page).toHaveURL(/\/household\/new$/);
  });

  test("fits the viewport and every control is at least 44 px", async ({ page, context }, info) => {
    await setup(context, info, []);
    await page.goto("/household/new");
    await expect(page.getByTestId("create-household")).toBeEnabled();
    await expectNoHorizontalScroll(page);
    await expectAllTapTargets(page.getByRole("main"));
  });
});

test.describe("members", () => {
  test("an owner sees every member, the role badges, and actions on admins and members only", async ({ page, context }, info) => {
    const { ids } = await setup(context, info, [{ name: LEE, role: "owner", members: [jordan_(info), sam_(info)] }]);
    await page.goto(`/household/${ids[0]}/members`);
    await expect(page.getByRole("heading", { level: 1, name: LEE })).toBeVisible();
    await expect(page.getByRole("heading", { level: 2, name: "Members (3)" })).toBeVisible();
    await expect(page.locator("[data-slot=page-header] [data-space=household]")).toContainText(LEE);
    // Section links: owners see Invitations.
    const nav = page.getByRole("navigation", { name: "Household sections" });
    await expect(nav.getByRole("link")).toHaveText(["Members", "Invitations", "Settings"]);
    await expect(nav.getByRole("link", { name: "Members" })).toHaveAttribute("aria-current", "page");
    // The owner's own row has no actions; admins and members have Change role and Remove.
    await expect(page.getByRole("button", { name: "Change role for Alex Lee" })).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Remove Alex Lee" })).toHaveCount(0);
    for (const name of ["Jordan Kim", "Sam Lee"]) {
      await expect(page.getByRole("button", { name: `Change role for ${name}` })).toBeVisible();
      await expect(page.getByRole("button", { name: `Remove ${name}` })).toBeVisible();
    }
    // "You" marks the viewer's own row.
    await expect(page.getByText("You", { exact: true }).filter({ visible: true })).toHaveCount(1);
    await expectNoHorizontalScroll(page);
    await expectAllTapTargets(page.getByRole("main"));
  });

  test("phone shows cards and tablet and desktop show a table, with Joined only from xl", async ({ page, context }, info) => {
    const { ids } = await setup(context, info, [{ name: LEE, role: "owner", members: [jordan_(info)] }]);
    await page.goto(`/household/${ids[0]}/members`);
    await expect(page.getByRole("heading", { name: "Members (2)" })).toBeVisible();
    const table = page.getByRole("table");
    const cards = page.getByTestId("member-card");
    if (info.project.name === "phone") {
      await expect(table).toBeHidden();
      await expect(cards).toHaveCount(2);
    } else {
      await expect(cards.first()).toBeHidden();
      await expect(table).toBeVisible();
      await expect(table.getByRole("columnheader", { name: "Joined" })).toBeVisible({ visible: info.project.name === "desktop" });
      await expect(table.getByRole("columnheader", { name: "Role" })).toBeVisible();
    }
  });

  test("an owner changes a role, sees the message, and the API stored it", async ({ page, context }, info) => {
    const { ids } = await setup(context, info, [{ name: LEE, role: "owner", members: [jordan_(info), sam_(info)] }]);
    await page.goto(`/household/${ids[0]}/members`);
    await page.getByRole("button", { name: "Change role for Sam Lee" }).click();
    const dialog = page.getByRole("dialog", { name: "Change role for Sam Lee" });
    await expect(dialog.getByRole("radio", { name: /Member/ })).toBeChecked();
    await expect(dialog.getByRole("radio", { name: /Member/ })).toBeFocused();
    const save = dialog.getByRole("button", { name: "Save role" });
    await expect(save).toBeDisabled(); // nothing changed yet
    await dialog.getByRole("radio", { name: /Admin/ }).check();
    await save.click();
    await expect(page.getByRole("dialog")).toHaveCount(0);
    await expect(page.locator("#members-message")).toHaveText("Role updated for Sam Lee.");
    await expect(page.getByRole("heading", { name: "Members (3)" })).toBeFocused(); // focus goes to the section heading
    await expect.poll(async () => (await storedSpace(ids[0])).members.find((m) => m.email.startsWith("sam."))?.role).toBe("admin");
    // The row updates after the refresh (the owner can still manage Sam).
    await expect(page.getByRole("button", { name: "Remove Sam Lee" })).toBeVisible();
  });

  test("an owner removes a member after a confirmation that starts on Cancel", async ({ page, context }, info) => {
    const { ids } = await setup(context, info, [{ name: LEE, role: "owner", members: [jordan_(info), sam_(info)] }]);
    await page.goto(`/household/${ids[0]}/members`);
    const trigger = page.getByRole("button", { name: "Remove Sam Lee" });
    await trigger.click();
    const dialog = page.getByRole("alertdialog", { name: "Remove Sam Lee?" });
    await expect(dialog).toContainText(`Sam Lee loses access to the shared records of ${LEE}. They keep their personal space.`);
    await expect(dialog.getByRole("button", { name: "Cancel" })).toBeFocused();
    // Escape cancels and returns focus to the button that opened it.
    await page.keyboard.press("Escape");
    await expect(page.getByRole("alertdialog")).toHaveCount(0);
    await expect(trigger).toBeFocused();
    expect((await storedSpace(ids[0])).members).toHaveLength(3);

    await trigger.click();
    await page.getByRole("alertdialog").getByRole("button", { name: "Remove member" }).click();
    await expect(page.getByRole("alertdialog")).toHaveCount(0);
    await expect(page.locator("#members-message")).toHaveText(`Sam Lee was removed from ${LEE}.`);
    await expect(page.getByRole("heading", { name: "Members (2)" })).toBeFocused();
    await expect(page.getByRole("button", { name: "Remove Sam Lee" })).toHaveCount(0);
    expect((await storedSpace(ids[0])).members.map((m) => m.email.split(".")[0])).not.toContain("sam");
  });

  test("an owner transfers ownership and becomes an admin", async ({ page, context }, info) => {
    const { ids, me } = await setup(context, info, [{ name: LEE, role: "owner", members: [jordan_(info)] }]);
    await page.goto(`/household/${ids[0]}/members`);
    await page.getByRole("button", { name: "Change role for Jordan Kim" }).click();
    await page.getByRole("dialog").getByRole("button", { name: "Transfer ownership" }).click();
    const alert = page.getByRole("alertdialog", { name: "Make Jordan Kim the owner?" });
    await expect(alert).toContainText("Jordan Kim becomes the only owner.");
    await expect(alert.getByRole("button", { name: "Cancel" })).toBeFocused();
    await alert.getByRole("button", { name: "Transfer ownership" }).click();
    await expect(page.locator("#members-message")).toHaveText("Jordan Kim is now the owner. You are an admin.");
    const stored = await storedSpace(ids[0]);
    expect(stored.members.find((m) => m.email === me.email)?.role).toBe("admin");
    expect(stored.members.find((m) => m.email.startsWith("jordan."))?.role).toBe("owner");
    // The viewer is an admin now: no Change role, and Jordan (the owner) has no actions.
    await expect(page.getByRole("button", { name: "Change role for Jordan Kim" })).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Remove Jordan Kim" })).toHaveCount(0);
  });

  test("an admin removes members only: no role changes, no actions on the owner or other admins", async ({ page, context }, info) => {
    const { ids } = await setup(context, info, [
      { name: LEE, role: "admin", members: [{ email: `owner.${cast(info).me.email}`, display_name: "Casey Owner", role: "owner" }, jordan_(info), sam_(info)] },
    ]);
    await page.goto(`/household/${ids[0]}/members`);
    await expect(page.getByRole("heading", { name: "Members (4)" })).toBeVisible();
    await expect(page.getByRole("button", { name: /^Change role/ })).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Remove Sam Lee" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Remove Casey Owner" })).toHaveCount(0); // the owner
    await expect(page.getByRole("button", { name: "Remove Jordan Kim" })).toHaveCount(0); // another admin
    await expect(page.getByRole("button", { name: "Remove Alex Lee" })).toHaveCount(0); // themselves
    await expect(page.getByRole("navigation", { name: "Household sections" }).getByRole("link", { name: "Invitations" })).toBeVisible();
    await page.getByRole("button", { name: "Remove Sam Lee" }).click();
    await page.getByRole("alertdialog").getByRole("button", { name: "Remove member" }).click();
    await expect(page.locator("#members-message")).toHaveText(`Sam Lee was removed from ${LEE}.`);
  });

  test("a member sees no actions and no Invitations section; its URL redirects to Members", async ({ page, context }, info) => {
    const { ids } = await setup(context, info, [
      { name: LEE, role: "member", members: [{ email: `owner.${cast(info).me.email}`, display_name: "Casey Owner", role: "owner" }, jordan_(info)] },
    ]);
    await page.goto(`/household/${ids[0]}/members`);
    await expect(page.getByRole("heading", { name: "Members (3)" })).toBeVisible();
    await expect(page.getByRole("button", { name: /^(Change role|Remove)/ })).toHaveCount(0);
    await expect(page.getByRole("navigation", { name: "Household sections" }).getByRole("link")).toHaveText(["Members", "Settings"]);
    await page.goto(`/household/${ids[0]}/invitations`);
    await expect(page).toHaveURL(new RegExp(`/household/${ids[0]}/members$`));
  });

  test("owners and admins reach the invitations placeholder; no invitation flow exists yet", async ({ page, context }, info) => {
    const { ids } = await setup(context, info, [{ name: LEE, role: "owner" }]);
    await page.goto(`/household/${ids[0]}/members`);
    // Only the owner is in the household: the invite prompt links to the Invitations section (HEM-016).
    await page.getByRole("button", { name: "Invite a member" }).click();
    await expect(page).toHaveURL(new RegExp(`/household/${ids[0]}/invitations$`));
    await expect(page.getByTestId("invitations-placeholder")).toContainText("Invitations are coming soon");
    await expect(page.getByRole("navigation", { name: "Household sections" }).getByRole("link", { name: "Invitations" })).toHaveAttribute(
      "aria-current",
      "page",
    );
    await expect(page.locator("main form")).toHaveCount(0);
  });

  test("a refusal from the API shows its message in the dialog and keeps it open", async ({ page, context }, info) => {
    const { ids } = await setup(context, info, [{ name: LEE, role: "owner", members: [jordan_(info), sam_(info)] }]);
    await page.goto(`/household/${ids[0]}/members`);
    await expect(page.getByRole("button", { name: "Remove Sam Lee" })).toBeEnabled();
    // Sam is removed elsewhere while this page is open.
    await removeFromHousehold(cast(info).sam, ids[0]);
    await page.getByRole("button", { name: "Remove Sam Lee" }).click();
    await page.getByRole("alertdialog").getByRole("button", { name: "Remove member" }).click();
    await expect(page.getByRole("alertdialog")).toContainText("Member not found.");
    await expect(page.getByRole("alertdialog")).toBeVisible();
    await page.getByRole("alertdialog").getByRole("button", { name: "Cancel" }).click();
    await expect(page.getByRole("alertdialog")).toHaveCount(0);
  });

  test("a load error keeps the header and section links and offers Retry", async ({ page, context }, info) => {
    const { ids, me } = await setup(context, info, [{ name: LEE, role: "owner" }]);
    await failLists(me, { members: true });
    await page.goto(`/household/${ids[0]}/members`);
    await expect(page.getByTestId("members-error")).toContainText("We could not load members just now.");
    await expect(page.getByRole("heading", { level: 1, name: LEE })).toBeVisible();
    await expect(page.getByRole("navigation", { name: "Household sections" })).toBeVisible();
    await failLists(me, { members: false });
    await page.getByTestId("members-error").getByRole("button", { name: "Retry" }).click();
    await expect(page.getByRole("heading", { name: "Members (1)" })).toBeVisible();
  });

  test("long names and emails wrap without horizontal scroll", async ({ page, context }, info) => {
    const longName = "The extended Lee-Kim-Rodriguez-Papadopoulos family household of Utrecht and surroundings";
    const longEmail = `a.very.long.address.that.keeps.going.${"x".repeat(30)}@subdomain.example.test`;
    const { ids } = await setup(context, info, [
      { name: longName, role: "owner", members: [{ email: longEmail, display_name: "Alexandra Constantina Papadopoulos-Lee", role: "admin" }] },
    ]);
    await page.goto(`/household/${ids[0]}/members`);
    await expect(page.getByRole("heading", { level: 1, name: longName })).toBeVisible();
    await expectNoHorizontalScroll(page);
    await page.goto("/household");
    await expect(page.getByTestId("household-list").getByRole("link")).toHaveCount(1);
    await expectNoHorizontalScroll(page);
    await page.goto(`/household/${ids[0]}/settings`);
    await expect(page.getByTestId("rename-form")).toBeVisible();
    await expectNoHorizontalScroll(page);
  });
});

test.describe("settings", () => {
  test("an owner renames the household; the name changes everywhere", async ({ page, context }, info) => {
    const { ids } = await setup(context, info, [{ name: LEE, role: "owner", members: [jordan_(info)] }]);
    await page.goto(`/household/${ids[0]}/settings`);
    const save = page.getByTestId("save-name");
    await expect(page.locator("#household-name")).toHaveValue(LEE);
    await expect(save).toBeDisabled(); // nothing changed yet
    await page.locator("#household-name").fill("Lee-Kim household");
    await expect(save).toBeEnabled();
    await save.click();
    await expect(page.locator("#rename-message")).toHaveText("Household name saved.");
    await expect(page.getByRole("heading", { level: 1, name: "Lee-Kim household" })).toBeVisible();
    await expect(save).toBeDisabled();
    expect((await storedSpace(ids[0])).name).toBe("Lee-Kim household");
    // The shell's space list refreshed: the switcher knows the new name.
    await page.getByRole("button", { name: /^Active space/ }).click();
    await expect(page.getByRole("menuitemradio", { name: /Lee-Kim household/ })).toBeVisible();
  });

  test("rename validates the name", async ({ page, context }, info) => {
    const { ids } = await setup(context, info, [{ name: LEE, role: "admin" }]);
    await page.goto(`/household/${ids[0]}/settings`);
    const input = page.locator("#household-name");
    await input.fill("");
    await input.blur();
    await expect(page.getByText("Enter a name for the household.")).toBeVisible();
    await input.fill("x".repeat(81));
    await expect(page.getByTestId("save-name")).toBeEnabled();
    await page.getByTestId("save-name").click();
    await expect(page.getByText("Use at most 80 characters.")).toBeVisible();
    expect((await storedSpace(ids[0])).name).toBe(LEE);
  });

  test("an admin can rename and leave, and sees no Delete card", async ({ page, context }, info) => {
    const { ids } = await setup(context, info, [{ name: LEE, role: "admin", members: [{ email: `owner.${cast(info).me.email}`, role: "owner" }] }]);
    await page.goto(`/household/${ids[0]}/settings`);
    await expect(page.getByTestId("rename-form")).toBeVisible();
    await expect(page.getByRole("heading", { name: "Delete household" })).toHaveCount(0);
    await expect(page.getByTestId("leave-household")).toBeEnabled();
  });

  test("a member sees the name read-only with a note, and can leave", async ({ page, context }, info) => {
    const { ids } = await setup(context, info, [{ name: LEE, role: "member", members: [{ email: `owner.${cast(info).me.email}`, role: "owner" }] }]);
    await page.goto(`/household/${ids[0]}/settings`);
    await expect(page.getByTestId("readonly-name")).toHaveText(LEE);
    await expect(page.getByText("Only owners and admins can rename the household.")).toBeVisible();
    await expect(page.getByTestId("rename-form")).toHaveCount(0);
    await expect(page.getByRole("heading", { name: "Delete household" })).toHaveCount(0);
    await expect(page.getByTestId("leave-household")).toBeEnabled();
  });

  test("an owner cannot leave: the button is disabled, explained, and links to Members", async ({ page, context }, info) => {
    const { ids } = await setup(context, info, [{ name: LEE, role: "owner", members: [jordan_(info)] }]);
    await page.goto(`/household/${ids[0]}/settings`);
    const leave = page.getByTestId("leave-household");
    await expect(leave).toBeDisabled();
    await expect(leave).toHaveAccessibleDescription("You are the owner. Transfer ownership to another member before you leave.");
    await page.getByRole("link", { name: "Go to members to transfer ownership" }).click();
    await expect(page).toHaveURL(new RegExp(`/household/${ids[0]}/members$`));
  });

  test("leaving: confirm, go to the list with a message, and the personal space is selected again", async ({ page, context }, info) => {
    const { ids, personalId } = await setup(context, info, [
      { name: LEE, role: "member", members: [{ email: `owner.${cast(info).me.email}`, role: "owner" }] },
    ]);
    // Select the household first, so leaving it has to fall back to the personal space.
    await page.goto("/dashboard");
    await page.getByRole("button", { name: /^Active space/ }).click();
    await page.getByRole("menuitemradio", { name: new RegExp(LEE) }).click();
    await expect.poll(async () => (await context.cookies()).find((c) => c.name === "hemfin-space")?.value).toBe(ids[0]);
    await expect(page.locator("[data-space-sync]")).toHaveAttribute("data-space-sync", "idle");
    await page.goto(`/household/${ids[0]}/settings`);
    await page.getByTestId("leave-household").click();
    const dialog = page.getByRole("alertdialog", { name: `Leave ${LEE}?` });
    await expect(dialog.getByRole("button", { name: "Cancel" })).toBeFocused();
    await dialog.getByRole("button", { name: "Leave household" }).click();

    await expect(page).toHaveURL(/\/household$/);
    await expect(page.locator("#flash-message")).toHaveText(`You left ${LEE}.`);
    await expect(page.getByRole("heading", { name: "Share finances with family" })).toBeVisible();
    await expect(page.locator("header[data-space]").first()).toHaveAttribute("data-space", "personal");
    await expect.poll(async () => (await context.cookies()).find((c) => c.name === "hemfin-space")?.value).toBe(personalId);
    // Leaving on purpose is not "lost access": no toast about it.
    await expect(page.getByTestId("toast")).toHaveCount(0);
    expect((await storedSpace(ids[0])).members.map((m) => m.email)).not.toContain(cast(info).me.email);
  });

  test("deleting asks for the exact name, then removes the household", async ({ page, context }, info) => {
    const { ids } = await setup(context, info, [{ name: LEE, role: "owner", members: [jordan_(info)] }]);
    await page.goto(`/household/${ids[0]}/settings`);
    await page.getByTestId("delete-household").click();
    const dialog = page.getByRole("alertdialog", { name: `Delete ${LEE}?` });
    const input = dialog.getByLabel(`Type ${LEE} to confirm`);
    const confirm = dialog.getByRole("button", { name: "Delete household" });
    await expect(input).toBeFocused();
    await expect(confirm).toBeDisabled();
    await input.fill("the lee family"); // case matters
    await input.blur();
    await expect(dialog.getByText("The name does not match. Type it exactly as shown above.")).toBeVisible();
    await expect(confirm).toBeDisabled();
    await input.fill(`  ${LEE} `); // trimmed
    await expect(confirm).toBeEnabled();
    await confirm.click();

    await expect(page).toHaveURL(/\/household$/);
    await expect(page.locator("#flash-message")).toHaveText(`${LEE} was deleted.`);
    expect(await storedSpace(ids[0]).catch(() => null)).toBeNull();
  });

  test("fits every viewport with 44 px controls", async ({ page, context }, info) => {
    const { ids } = await setup(context, info, [{ name: LEE, role: "owner", members: [jordan_(info)] }]);
    await page.goto(`/household/${ids[0]}/settings`);
    await expect(page.getByTestId("save-name")).toBeVisible();
    await expectNoHorizontalScroll(page);
    await expectAllTapTargets(page.getByRole("main"));
    await page.getByTestId("delete-household").click();
    await expectAllTapTargets(page.getByRole("alertdialog"));
  });
});

test.describe("household not found", () => {
  test("a missing household, someone else's household and a personal space id show the same screen", async ({ page, context }, info) => {
    const { personalId } = await setup(context, info, [{ name: LEE }]);
    // A household of another user, which this user is not in.
    const other = { email: `other-${uniqueUser(info).email}` };
    const theirs = await seedHouseholds(other, [{ name: "Not yours" }]);
    for (const id of ["00000000-0000-4000-8000-000000000000", theirs.ids[0], personalId, "not-a-uuid"]) {
      for (const section of ["members", "invitations", "settings"]) {
        await page.goto(`/household/${id}/${section}`);
        const nf = page.getByTestId("household-not-found");
        await expect(nf.getByRole("heading", { level: 1, name: "We could not find that household" })).toBeVisible();
        await expect(nf).toContainText("Check the link, or choose a household from your list.");
        await expect(page.locator("main [data-space]")).toHaveCount(0); // no space badge
        // The normal shell is still there.
        await expect(page.getByRole("button", { name: /^Active space/ })).toBeVisible();
      }
    }
    await expectNoHorizontalScroll(page);
    await page.getByRole("main").getByRole("link", { name: "Go to households" }).click();
    await expect(page).toHaveURL(/\/household$/);
  });
});

test.describe("space switcher", () => {
  async function openSwitcher(page: Page) {
    const trigger = page.getByRole("button", { name: /^Active space/ });
    await expect(trigger).toBeEnabled();
    await trigger.click();
    return { trigger, menu: page.getByRole("menu", { name: "Spaces" }) };
  }

  test("lists Personal first, then households by name, with roles, a heading row and two footer links", async ({ page, context }, info) => {
    await setup(context, info, [
      { name: "Zed house", role: "member" },
      { name: LEE, role: "owner" },
      { name: "Lee cousins", role: "admin" },
    ]);
    await page.goto("/dashboard");
    const { menu } = await openSwitcher(page);
    const rows = menu.getByRole("menuitemradio");
    await expect(rows).toHaveCount(4);
    await expect(rows.nth(0)).toContainText("Personal");
    await expect(rows.nth(0)).toContainText("Only you");
    await expect(rows.nth(1)).toContainText("Lee cousins");
    await expect(rows.nth(1)).toContainText("Admin");
    await expect(rows.nth(2)).toContainText(LEE);
    await expect(rows.nth(3)).toContainText("Zed house");
    await expect(rows.nth(0)).toHaveAttribute("aria-checked", "true");
    await expect(rows.nth(1)).toHaveAttribute("aria-checked", "false");
    // Heading row: the active space's badge. Two footer links.
    await expect(page.getByTestId("space-switcher-popup").locator("[data-space=personal]")).toContainText("Personal");
    await expect(page.getByRole("link", { name: "Manage households" })).toHaveAttribute("href", "/household");
    await expect(page.getByRole("link", { name: "Create a household" })).toHaveAttribute("href", "/household/new");
    for (const link of await page.getByTestId("space-switcher-popup").getByRole("link").all()) await expectTapTarget(link, "footer link");
    for (const row of await rows.all()) expect((await row.boundingBox())!.height).toBeGreaterThanOrEqual(44);
    await expectNoHorizontalScroll(page);
  });

  test("keyboard: focus starts on the active row, arrows wrap, Home and End jump, Enter selects and returns focus", async ({ page, context }, info) => {
    await setup(context, info, [{ name: LEE, role: "owner" }, { name: "Lee cousins", role: "member" }]);
    await page.goto("/dashboard");
    const { trigger, menu } = await openSwitcher(page);
    const rows = menu.getByRole("menuitemradio");
    await expect(rows.nth(0)).toBeFocused(); // Personal is active
    await page.keyboard.press("ArrowDown");
    await expect(rows.nth(1)).toBeFocused();
    await page.keyboard.press("ArrowDown");
    await expect(rows.nth(2)).toBeFocused();
    await page.keyboard.press("ArrowDown");
    await expect(rows.nth(0)).toBeFocused(); // wraps
    await page.keyboard.press("ArrowUp");
    await expect(rows.nth(2)).toBeFocused(); // wraps back
    await page.keyboard.press("Home");
    await expect(rows.nth(0)).toBeFocused();
    await page.keyboard.press("End");
    await expect(rows.nth(2)).toBeFocused();
    await page.keyboard.press("Home");
    await page.keyboard.press("ArrowDown"); // "Lee cousins"
    await page.keyboard.press("Enter");
    await expect(menu).toHaveCount(0);
    await expect(trigger).toBeFocused();
    await expect(page.getByRole("button", { name: "Active space: Lee cousins. Switch space." })).toBeVisible();
    await expect(page.locator("header[data-space]").first()).toHaveAttribute("data-space", "household");
  });

  test("keyboard: Escape closes without changing the space and returns focus to the trigger", async ({ page, context }, info) => {
    await setup(context, info, [{ name: LEE, role: "owner" }]);
    await page.goto("/dashboard");
    const { trigger, menu } = await openSwitcher(page);
    await page.keyboard.press("ArrowDown");
    await page.keyboard.press("Escape");
    await expect(menu).toHaveCount(0);
    await expect(trigger).toBeFocused();
    await expect(page.getByRole("button", { name: "Active space: Personal. Switch space." })).toBeVisible();
  });

  test("keyboard: Tab closes the menu and moves on; there is no focus trap", async ({ page, context }, info) => {
    await setup(context, info, [{ name: LEE, role: "owner" }]);
    await page.goto("/dashboard");
    const { trigger, menu } = await openSwitcher(page);
    await page.keyboard.press("Tab");
    await expect(menu).toHaveCount(0);
    // Focus went to the next control after the trigger (the notifications link), not back to the trigger.
    await expect(trigger).not.toBeFocused();
    await expect(page.getByRole("link", { name: "Notifications" }).first()).toBeFocused();
    // Shift+Tab from an open menu goes to the control before the trigger.
    await trigger.focus();
    await page.keyboard.press("Enter");
    await expect(menu).toBeVisible();
    await page.keyboard.press("Shift+Tab");
    await expect(menu).toHaveCount(0);
    await expect(trigger).not.toBeFocused();
    // The menu is not a dialog: nothing is inert, and an outside click closes it.
    await trigger.click();
    await expect(menu).toBeVisible();
    await expect(page.getByRole("dialog")).toHaveCount(0);
    await page.mouse.click(5, 300);
    await expect(menu).toHaveCount(0);
  });

  test("the arrow key opens the menu from the trigger", async ({ page, context }, info) => {
    await setup(context, info, []);
    await page.goto("/dashboard");
    const trigger = page.getByRole("button", { name: /^Active space/ });
    await expect(trigger).toBeEnabled();
    await trigger.focus();
    await page.keyboard.press("ArrowDown");
    await expect(page.getByRole("menu", { name: "Spaces" })).toBeVisible();
    await expect(page.getByRole("menuitemradio").first()).toBeFocused();
    await expect(trigger).toHaveAttribute("aria-expanded", "true");
  });

  test("long household names clamp to two lines in the rows and stay readable in the heading row", async ({ page, context }, info) => {
    const longName = "The extended Lee-Kim-Rodriguez-Papadopoulos family household of Utrecht and surroundings north of the river";
    await setup(context, info, [{ name: longName, role: "owner" }]);
    await page.goto("/dashboard");
    const { menu } = await openSwitcher(page);
    const row = menu.getByRole("menuitemradio", { name: new RegExp("extended Lee-Kim") });
    await expect(row).toBeVisible();
    const nameBox = await row.locator(".line-clamp-2").boundingBox();
    expect(nameBox!.height).toBeLessThanOrEqual(2 * 24 + 2); // two lines of the body-strong line height
    await row.click();
    await expect(page.getByRole("button", { name: `Active space: ${longName}. Switch space.` })).toBeVisible();
    await page.getByRole("button", { name: /^Active space/ }).click();
    // Heading row shows the (clamped) name with the full name in its title.
    await expect(page.getByTestId("space-switcher-popup").locator("[data-space=household]")).toHaveAttribute("title", longName);
    await expectNoHorizontalScroll(page);
    await page.keyboard.press("Escape");
    // The trigger never grows past its maximum width.
    const box = await page.getByRole("button", { name: /^Active space/ }).boundingBox();
    expect(box!.width).toBeLessThanOrEqual(176);
  });

  test("on a household page, choosing another space opens its dashboard; choosing the same one keeps the page", async ({ page, context }, info) => {
    const { ids, personalId } = await setup(context, info, [{ name: LEE, role: "owner" }, { name: "Lee cousins", role: "member" }]);
    const cookie = async () => (await context.cookies()).find((c) => c.name === "hemfin-space")?.value;
    await page.goto(`/household/${ids[0]}/members`);
    // The same household as the page: the page stays.
    let { menu } = await openSwitcher(page);
    await menu.getByRole("menuitemradio", { name: new RegExp(LEE) }).click();
    await expect.poll(cookie).toBe(ids[0]);
    await expect(page.locator("[data-space-sync]")).toHaveAttribute("data-space-sync", "idle");
    await expect(page).toHaveURL(new RegExp(`/household/${ids[0]}/members$`));
    await expect(page.getByRole("heading", { level: 1, name: LEE })).toBeVisible();
    // Another space: the dashboard of that space.
    ({ menu } = await openSwitcher(page));
    await menu.getByRole("menuitemradio", { name: /Lee cousins/ }).click();
    await expect(page).toHaveURL(/\/dashboard$/);
    await expect(page.getByRole("button", { name: "Active space: Lee cousins. Switch space." })).toBeVisible();
    // On other pages (not household pages) the page is kept.
    await page.goto("/contracts");
    ({ menu } = await openSwitcher(page));
    await menu.getByRole("menuitemradio", { name: /Personal/ }).click();
    await expect.poll(cookie).toBe(personalId);
    await expect(page.locator("[data-space-sync]")).toHaveAttribute("data-space-sync", "idle");
    await expect(page).toHaveURL(/\/contracts$/);
  });

  test("a saved space that is not one of the user's falls back to personal and the cookie is repaired", async ({ page, context }, info) => {
    const { personalId } = await setup(context, info, [{ name: LEE }]);
    await context.addCookies([
      { name: "hemfin-space", value: "11111111-1111-4111-8111-111111111111", url: "http://127.0.0.1:3100", httpOnly: true, sameSite: "Lax" },
    ]);
    await page.goto("/dashboard");
    await expect(page.locator("header[data-space]").first()).toHaveAttribute("data-space", "personal");
    await expect(page.getByTestId("toast")).toContainText("You no longer have access to that household.");
    await expect.poll(async () => (await context.cookies()).find((c) => c.name === "hemfin-space")?.value).toBe(personalId);
  });

  test("losing access to the active household falls back to personal and names the household", async ({ page, context }, info) => {
    const { ids, me } = await setup(context, info, [{ name: LEE, role: "member", members: [{ email: `owner.${cast(info).me.email}`, role: "owner" }] }]);
    await page.goto("/dashboard");
    const { menu } = await openSwitcher(page);
    await menu.getByRole("menuitemradio", { name: new RegExp(LEE) }).click();
    await expect.poll(async () => (await context.cookies()).find((c) => c.name === "hemfin-space")?.value).toBe(ids[0]);
    await expect(page.locator("[data-space-sync]")).toHaveAttribute("data-space-sync", "idle");
    await page.waitForLoadState("networkidle");
    // Someone removes the user, then the page is loaded again.
    await removeFromHousehold(me, ids[0]);
    await page.goto("/dashboard");
    await expect(page.locator("header[data-space]").first()).toHaveAttribute("data-space", "personal");
    await expect(page.getByTestId("toast")).toContainText(`You no longer have access to ${LEE}.`);
  });

  test("the cookie keeps the real household id across a reload", async ({ page, context }, info) => {
    const { ids } = await setup(context, info, [{ name: LEE, role: "owner" }]);
    await page.goto("/dashboard");
    const { menu } = await openSwitcher(page);
    await menu.getByRole("menuitemradio", { name: new RegExp(LEE) }).click();
    await expect.poll(async () => (await context.cookies()).find((c) => c.name === "hemfin-space")?.value).toBe(ids[0]);
    await expect(page.locator("[data-space-sync]")).toHaveAttribute("data-space-sync", "idle");
    await page.waitForLoadState("networkidle");
    await page.reload();
    await expect(page.locator("header[data-space]").first()).toHaveAttribute("data-space", "household");
    await expect(page.getByRole("button", { name: `Active space: ${LEE}. Switch space.` })).toBeVisible();
    await expect(page.getByTestId("toast")).toHaveCount(0);
  });
});

test.describe("before JavaScript is ready", () => {
  // Every server-rendered form must be safe to submit without JavaScript: the button is disabled
  // and a forced submit posts to the page, so nothing a user typed ends up in the URL.
  async function forcedSubmit(page: Page, form: Locator) {
    const navigated = page.waitForEvent("framenavigated", (frame) => frame === page.mainFrame());
    await form.evaluate((f) => (f as HTMLFormElement).requestSubmit());
    await navigated;
    await page.waitForLoadState("load");
  }

  test("/household/new: no form value reaches the URL and the button is disabled", async ({ page, context }, info) => {
    await setup(context, info, []);
    await page.route("**/_next/static/**", (route) => route.abort());
    await page.goto("/household/new");
    const form = page.getByTestId("create-household-form");
    await expect(form).toBeVisible();
    await expect(form).toHaveAttribute("method", "post");
    await expect(form.locator('button[type="submit"]')).toBeDisabled();
    await page.locator("#name").fill("leak-check-household");
    await forcedSubmit(page, form);
    expect(new URL(page.url()).search, `ended at ${page.url()}`).toBe("");
    expect(decodeURIComponent(page.url())).not.toContain("leak-check");
  });

  test("settings rename form: no form value reaches the URL and the button is disabled", async ({ page, context }, info) => {
    const { ids } = await setup(context, info, [{ name: LEE, role: "owner" }]);
    await page.route("**/_next/static/**", (route) => route.abort());
    await page.goto(`/household/${ids[0]}/settings`);
    const form = page.getByTestId("rename-form");
    await expect(form).toBeVisible();
    await expect(form).toHaveAttribute("method", "post");
    await expect(form.locator('button[type="submit"]')).toBeDisabled();
    await page.locator("#household-name").fill("leak-check-rename");
    await forcedSubmit(page, form);
    expect(new URL(page.url()).search, `ended at ${page.url()}`).toBe("");
    expect(decodeURIComponent(page.url())).not.toContain("leak-check");
  });

  test("members and settings actions are disabled and the list has no forms before JavaScript", async ({ page, context }, info) => {
    const { ids } = await setup(context, info, [{ name: LEE, role: "owner", members: [jordan_(info)] }]);
    await page.route("**/_next/static/**", (route) => route.abort());
    await page.goto(`/household/${ids[0]}/members`);
    await expect(page.getByRole("heading", { name: "Members (2)" })).toBeVisible();
    await expect(page.locator("main form")).toHaveCount(0);
    for (const button of await page.getByRole("main").getByRole("button").all()) {
      if (await button.isVisible()) await expect(button).toBeDisabled();
    }
    await page.goto("/household");
    await expect(page.getByTestId("household-list")).toBeVisible();
    await expect(page.locator("main form")).toHaveCount(0);
  });
});

test.describe("keeps the earlier flows working", () => {
  test("the Household nav item stays active on every household route", async ({ page, context }, info) => {
    const { ids } = await setup(context, info, [{ name: LEE, role: "owner" }]);
    test.skip(info.project.name === "phone", "the phone has no side nav; Household sits under More");
    for (const path of ["/household", "/household/new", `/household/${ids[0]}/members`, `/household/${ids[0]}/settings`]) {
      await page.goto(path);
      await expect(page.getByTestId("side-nav").getByRole("link", { name: "Household" })).toHaveAttribute("aria-current", "page");
    }
  });
});
