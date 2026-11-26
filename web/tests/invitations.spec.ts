import { expect, test, type BrowserContext, type Locator, type Page, type Request, type TestInfo } from "@playwright/test";
import {
  invitationMode,
  failLists,
  seed,
  seedHouseholds,
  seedInvitation,
  signInAs,
  storedInvitations,
  tokenLeaks,
  uniqueUser,
  type SeedHousehold,
} from "./support/auth";

// HEM-016: invitations (admin side) and the /invite accept page, against the mock backend
// (tests/support/mock-backend.mjs). Each test signs in as its own user and seeds its own household,
// so parallel tests never share state. The token checks assert on the requests the browser really sent.

const LEE = "The Lee family";
const INVITER = "Jordan Kim";
const GENERIC_TITLE = "This invitation can't be used";
const GENERIC_BODY = "This invitation link is no longer valid. Ask the person who invited you to send a new one.";
const GENERIC_PATH = "If you were invited at a different email address, sign out, then sign in with that address.";
const GENERIC_PATH_SIGNED_OUT = "If you were invited at a different email address, sign in with that address.";
const TOKEN_KEY = "hemfin-invite-token";

async function expectNoHorizontalScroll(page: Page) {
  const { scrollWidth, clientWidth } = await page.evaluate(() => ({
    scrollWidth: document.documentElement.scrollWidth,
    clientWidth: document.documentElement.clientWidth,
  }));
  expect(scrollWidth).toBeLessThanOrEqual(clientWidth);
}

/** Every visible link, button and text field in `scope` is at least 44 px tall, and every radio's label too. */
async function expectAllTapTargets(scope: Locator) {
  const targets = await scope.locator("a[href], button, input:not([type=hidden]):not([type=radio]), label:has(input[type=radio])").all();
  for (const t of targets) {
    if (!(await t.isVisible())) continue;
    const box = await t.boundingBox();
    const label = (await t.innerText().catch(() => "")) || (await t.getAttribute("aria-label")) || "control";
    expect(box!.height, `"${label.slice(0, 40)}" height`).toBeGreaterThanOrEqual(44);
  }
}

/** A token-shaped value (the real ones are 43 URL-safe characters) is made by the mock; tests only pass it around. */
function cast(info: TestInfo) {
  const admin = uniqueUser(info);
  const base = admin.email.replace("@example.test", "");
  return {
    admin,
    invitee: { email: `alex.${base}@example.test` },
    other: { email: `other.${base}@example.test` },
    sam: { email: `sam.${base}@example.test`, display_name: "Sam Lee" },
    taylor: `taylor.${base}@example.test`,
  };
}

/** The test's admin (called Jordan Kim) owns one household. Returns its id. */
async function setupAdmin(context: BrowserContext, info: TestInfo, household: Partial<SeedHousehold> = {}) {
  const { admin } = cast(info);
  await seed(admin, { display_name: INVITER });
  const { ids } = await seedHouseholds(admin, [{ name: LEE, role: "owner", ...household }]);
  await signInAs(context, admin);
  return { admin, spaceId: ids[0] };
}

const invitationsUrl = (spaceId: string) => `/household/${spaceId}/invitations`;

/** The visible row or card for an address (the page renders both the table and the card list; CSS hides one). */
const rowFor = (page: Page, email: string) =>
  page
    .locator('[data-testid="invitation-row"], [data-testid="invitation-card"]')
    .filter({ visible: true })
    .filter({ hasText: email });

const visible = (l: Locator) => l.filter({ visible: true });

// ------------------------------------------------------------------------------------------------
// Admin side
// ------------------------------------------------------------------------------------------------

test.describe("invitations: admin", () => {
  test("empty state, validation, then Pending row with the form cleared", async ({ page, context }, info) => {
    const { spaceId } = await setupAdmin(context, info);
    const { sam } = cast(info);
    await page.goto(invitationsUrl(spaceId));
    await expect(page.getByRole("heading", { level: 2, name: "Invite someone" })).toBeVisible();
    await expect(page.getByTestId("invitations-empty")).toContainText("No invitations yet");

    const send = page.getByTestId("send-invitation");
    await send.click();
    await expect(page.getByText("Enter the email address to invite.")).toBeVisible();
    await expect(page.locator("#invite-email")).toBeFocused();
    await page.locator("#invite-email").fill("nope");
    await page.locator("#invite-email").blur();
    await expect(page.getByText("Enter an email address like name@example.com.")).toBeVisible();

    // The empty state's button moves focus to the field.
    await page.getByTestId("invitations-empty").getByRole("button", { name: "Invite someone" }).click();
    await expect(page.locator("#invite-email")).toBeFocused();

    // Member is the default role; choose Admin.
    await expect(page.getByRole("radio", { name: /Member/ })).toBeChecked();
    await page.getByRole("radio", { name: /Admin/ }).check();
    await page.locator("#invite-email").fill(`  ${sam.email.toUpperCase()}  `);
    await send.click();

    await expect(page.locator("#invite-notice")).toContainText(`Invitation sent to ${sam.email}. The link works for 7 days.`);
    const row = rowFor(page, sam.email);
    await expect(row).toBeVisible();
    await expect(row).toContainText("Pending");
    await expect(row).toContainText("Admin");
    await expect(row).toContainText(/Expires [A-Z][a-z]{2} \d/);
    await expect(page.locator("#invite-email")).toHaveValue("");
    await expect(page.getByRole("radio", { name: /Member/ })).toBeChecked();
    await expect(page.getByTestId("invitations-empty")).toHaveCount(0);
    expect((await storedInvitations(spaceId)).map((i) => [i.email, i.role, i.status])).toEqual([[sam.email, "admin", "pending"]]);
    await expectNoHorizontalScroll(page);
  });

  test("409: already a member and already invited show a field error", async ({ page, context }, info) => {
    const { sam, taylor } = cast(info);
    const { spaceId } = await setupAdmin(context, info, { members: [{ ...sam, role: "member" }] });
    await seedInvitation({ space_id: spaceId, email: taylor });
    await page.goto(invitationsUrl(spaceId));
    await expect(rowFor(page, taylor)).toBeVisible();

    await page.locator("#invite-email").fill(sam.email);
    await page.getByTestId("send-invitation").click();
    await expect(page.locator("#invite-email-error")).toContainText("This person is already a member of the household.");
    await expect(page.locator("#invite-email")).toHaveAttribute("aria-invalid", "true");

    await page.locator("#invite-email").fill(taylor);
    await page.getByTestId("send-invitation").click();
    await expect(page.locator("#invite-email-error")).toContainText(
      "There is already a pending invitation for this address. Resend it or revoke it below.",
    );
  });

  test("503 email_not_sent: the row appears with Resend, and Resend then works", async ({ page, context }, info) => {
    const { admin, sam } = cast(info);
    const { spaceId } = await setupAdmin(context, info);
    await invitationMode(admin, { email_mode: "not_sent" });
    await page.goto(invitationsUrl(spaceId));
    await page.locator("#invite-email").fill(sam.email);
    await page.getByTestId("send-invitation").click();

    await expect(page.locator("#invite-notice")).toContainText("We saved the invitation but couldn't send the email. Try Resend in a moment.");
    const row = rowFor(page, sam.email);
    await expect(row).toBeVisible();
    await expect(row).toContainText("Pending");
    const resend = row.getByRole("button", { name: /^Resend/ });
    await expect(resend).toBeEnabled();

    // The same copy for a failed resend, then a good one.
    await resend.click();
    await expect(row).toContainText("We saved the invitation but couldn't send the email. Try Resend in a moment.");
    await invitationMode(admin, { email_mode: "ok" });
    await resend.click();
    await expect(row).toContainText("Invitation resent. The old link no longer works.");
  });

  test("503 when email is not configured: nothing is saved", async ({ page, context }, info) => {
    const { admin, sam } = cast(info);
    const { spaceId } = await setupAdmin(context, info);
    await invitationMode(admin, { email_mode: "unconfigured" });
    await page.goto(invitationsUrl(spaceId));
    await page.locator("#invite-email").fill(sam.email);
    await page.getByTestId("send-invitation").click();
    await expect(page.locator("#invite-notice")).toContainText("Invitations are not available right now. Try again later.");
    expect(await storedInvitations(spaceId)).toEqual([]);
    await expect(page.getByTestId("invitations-empty")).toBeVisible();
  });

  test("resend right after sending is rate limited with a live countdown, then works", async ({ page, context }, info) => {
    test.setTimeout(60_000); // waits out a real 15 second cooldown
    const { invitee } = cast(info);
    const { spaceId } = await setupAdmin(context, info);
    // The last email went out 45 seconds ago, so the 60 second cooldown has about 15 seconds left.
    await seedInvitation({ space_id: spaceId, email: invitee.email, last_sent_seconds_ago: 45 });
    await page.goto(invitationsUrl(spaceId));
    const row = rowFor(page, invitee.email);
    const resend = row.getByRole("button", { name: /^Resend/ });
    // The row's polite live region is in the DOM, empty, before anything happens.
    const live = row.getByTestId("row-live");
    await expect(live).toHaveAttribute("aria-live", "polite");
    await expect(live).toHaveText("");
    await resend.click();
    const wait = row.getByTestId("resend-wait");
    await expect(wait).toContainText(/You can resend this invitation again in \d+ seconds?\./);
    await expect(resend).toHaveAttribute("aria-disabled", "true");
    // The held-off button points at the visible reason.
    const reasonId = await resend.getAttribute("aria-describedby");
    expect(reasonId).toBeTruthy();
    await expect(wait).toHaveAttribute("id", reasonId!);
    // Announced once, when the wait starts, and not again on each tick.
    await expect(live).toHaveText(/^You can resend in \d+ seconds?\.$/);
    const announced = await live.innerText();
    await resend.dispatchEvent("click"); // does nothing while the countdown runs
    await expect(wait).toBeVisible();
    await page.waitForTimeout(2200);
    expect(await live.innerText()).toBe(announced);
    // The countdown ends by itself, is announced once, and Resend works again.
    await expect(wait).toHaveCount(0, { timeout: 25_000 });
    await expect(live).toHaveText("You can resend now.");
    await expect(resend).not.toHaveAttribute("aria-disabled", "true");
    await expect(resend).not.toHaveAttribute("aria-describedby", /.+/);
    await resend.click();
    await expect(row).toContainText("Invitation resent. The old link no longer works.");
    await expect(live).toHaveText("Invitation resent. The old link no longer works.");
  });

  test("resend at the daily cap says so in words", async ({ page, context }, info) => {
    const { invitee } = cast(info);
    const { spaceId } = await setupAdmin(context, info);
    await seedInvitation({ space_id: spaceId, email: invitee.email, resend_count: 3 });
    await page.goto(invitationsUrl(spaceId));
    const row = rowFor(page, invitee.email);
    await row.getByRole("button", { name: /^Resend/ }).click();
    await expect(row).toContainText(/You can resend this invitation up to 3 times a day\. Try again in about \d+ hours?\./);
    await expect(row.getByTestId("resend-wait")).toHaveCount(0);
    // The daily-cap text is announced in the row's live region, and the held-off Resend points at it.
    await expect(row.getByTestId("row-live")).toHaveText(/up to 3 times a day/);
    const id = await row.getByRole("button", { name: /^Resend/ }).getAttribute("aria-describedby");
    await expect(row.getByTestId("row-message")).toHaveAttribute("id", id!);
  });

  test("revoke asks first, focuses Cancel, then shows Revoked with no actions", async ({ page, context }, info) => {
    const { invitee } = cast(info);
    const { spaceId } = await setupAdmin(context, info);
    await seedInvitation({ space_id: spaceId, email: invitee.email });
    await page.goto(invitationsUrl(spaceId));
    const row = rowFor(page, invitee.email);
    const revoke = row.getByRole("button", { name: /^Revoke/ });
    await revoke.click();
    const dialog = page.getByRole("alertdialog", { name: "Revoke this invitation?" });
    await expect(dialog).toContainText(`${invitee.email} can no longer use the link. You can invite them again later.`);
    await expect(dialog.getByRole("button", { name: "Cancel" })).toBeFocused();

    // Cancel changes nothing and returns focus to the button.
    await dialog.getByRole("button", { name: "Cancel" }).click();
    await expect(dialog).toHaveCount(0);
    await expect(revoke).toBeFocused();
    expect((await storedInvitations(spaceId))[0].status).toBe("pending");

    await revoke.click();
    await page.getByTestId("confirm-revoke").click();
    await expect(page.locator("#invitations-list-notice")).toContainText("Invitation revoked.");
    await expect(row).toContainText("Revoked");
    await expect(row.getByRole("button")).toHaveCount(0);
    await expect(page.locator("#invitations-heading")).toBeFocused();
    expect((await storedInvitations(spaceId))[0].status).toBe("revoked");
  });

  test("every status has its chip, and only pending and expired rows have actions", async ({ page, context }, info) => {
    const { spaceId } = await setupAdmin(context, info);
    const emails = ["pending", "expired", "accepted", "declined", "revoked"].map((s) => `${s}.${cast(info).admin.email}`);
    const statuses = ["pending", "expired", "accepted", "declined", "revoked"] as const;
    for (const [i, status] of statuses.entries()) await seedInvitation({ space_id: spaceId, email: emails[i], status });
    await page.goto(invitationsUrl(spaceId));
    for (const [i, status] of statuses.entries()) {
      const row = rowFor(page, emails[i]);
      await expect(row.locator("[data-slot=status-chip]")).toHaveAttribute("data-status", status);
      await expect(row.getByRole("button")).toHaveCount(status === "pending" || status === "expired" ? 2 : 0);
    }
    // Newest first: the last one seeded is on top.
    await expect(visible(page.getByTestId(/^invitation-email-(list|table)$/)).first()).toHaveText(emails[4]);
    await expectNoHorizontalScroll(page);
    await expectAllTapTargets(page.getByRole("main"));
  });

  test("Show more loads the next page", async ({ page, context }, info) => {
    const { spaceId } = await setupAdmin(context, info);
    for (let i = 0; i < 23; i++) await seedInvitation({ space_id: spaceId, email: `p${String(i).padStart(2, "0")}.${cast(info).admin.email}` });
    await page.goto(invitationsUrl(spaceId));
    const emails = visible(page.getByTestId(/^invitation-email-(list|table)$/));
    await expect(emails).toHaveCount(20);
    const more = page.getByTestId("show-more");
    await more.click();
    await expect(emails).toHaveCount(23);
    await expect(more).toHaveCount(0);
  });

  test("a list error shows Retry and the form still works", async ({ page, context }, info) => {
    const { admin, sam } = cast(info);
    const { spaceId } = await setupAdmin(context, info);
    await invitationMode(admin, { fail_invitations_list: true });
    await page.goto(invitationsUrl(spaceId));
    await expect(page.getByTestId("invitations-error")).toContainText("We could not load invitations just now.");
    await invitationMode(admin, { fail_invitations_list: false });
    await page.getByTestId("invitations-error").getByRole("button", { name: "Retry" }).click();
    await expect(page.getByTestId("invitations-empty")).toBeVisible();
    await page.locator("#invite-email").fill(sam.email);
    await page.getByTestId("send-invitation").click();
    await expect(rowFor(page, sam.email)).toBeVisible();
  });

  test("the loading state shows skeletons while the form is already usable", async ({ page, context }, info) => {
    test.skip(info.project.name === "phone", "WebKit hides streamed fallbacks until the stream ends");
    const { admin } = cast(info);
    const { spaceId } = await setupAdmin(context, info);
    await failLists(admin, { delay_ms: 4000 });
    await page.goto(invitationsUrl(spaceId), { waitUntil: "commit" });
    await expect(page.getByTestId("invitations-loading")).toBeVisible();
    await expect(page.getByRole("heading", { level: 2, name: "Invite someone" })).toBeVisible();
  });

  test("a member cannot open the page and is sent to Members", async ({ page, context }, info) => {
    const { spaceId } = await setupAdmin(context, info, { role: "member", members: [{ email: cast(info).sam.email, role: "owner" }] });
    await page.goto(invitationsUrl(spaceId));
    await expect(page).toHaveURL(new RegExp(`/household/${spaceId}/members$`));
  });

  test("layout: no horizontal scroll, long addresses wrap, tap targets", async ({ page, context }, info) => {
    const { spaceId } = await setupAdmin(context, info);
    const long = `a-very-long-address-that-must-wrap-onto-more-than-one-line.${"x".repeat(30)}@example.test`;
    await seedInvitation({ space_id: spaceId, email: long, role: "admin" });
    await seedInvitation({ space_id: spaceId, email: cast(info).sam.email, status: "expired" });
    await page.goto(invitationsUrl(spaceId));
    await expect(rowFor(page, long)).toBeVisible();
    await expectNoHorizontalScroll(page);
    await expectAllTapTargets(page.getByRole("main"));
    // Phone: cards. Tablet and desktop: a table.
    const phone = info.project.name === "phone";
    await expect(page.getByRole("table", { name: "Invitations" })).toBeVisible({ visible: !phone });
    await expect(page.getByRole("list", { name: "Invitations" })).toBeVisible({ visible: phone });
    // At 1280 px the form sits beside the list; below that it is above it.
    const form = (await page.getByTestId("invite-form").boundingBox())!;
    const list = (await page.locator("#invitations-heading").boundingBox())!;
    if (info.project.name === "desktop") expect(list.x).toBeGreaterThan(form.x + form.width - 1);
    else expect(list.y).toBeGreaterThan(form.y + form.height - 1);
    // The table fits its box: nothing is clipped on the right.
    if (!phone) {
      const clipped = await page.evaluate(() => {
        const wrap = document.querySelector("table")!.parentElement!;
        return wrap.scrollWidth > wrap.clientWidth;
      });
      expect(clipped).toBe(false);
    }
  });

  test("members table (moved onto DataTable) still renders as cards on phone and a table from md", async ({ page, context }, info) => {
    const { spaceId } = await setupAdmin(context, info, { members: [{ ...cast(info).sam, role: "member" }] });
    await page.goto(`/household/${spaceId}/members`);
    // Once hydrated, the row actions are enabled (they are only dimmed before that) and their text is readable.
    const change = page.getByRole("button", { name: /^Change role for/ }).filter({ visible: true }).first();
    await expect(change).toBeEnabled();
    const ratio = await change.evaluate((el) => {
      // A canvas turns any CSS colour (including oklch) into sRGB pixels.
      const lum = (css: string) => {
        const canvas = document.createElement("canvas");
        canvas.width = canvas.height = 1;
        const ctx = canvas.getContext("2d")!;
        ctx.fillStyle = css;
        ctx.fillRect(0, 0, 1, 1);
        const [r, g, b] = [...ctx.getImageData(0, 0, 1, 1).data].slice(0, 3).map((v) => {
          const c = v / 255;
          return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
        });
        return 0.2126 * r + 0.7152 * g + 0.0722 * b;
      };
      const s = getComputedStyle(el);
      const [a, b] = [lum(s.color), lum(s.backgroundColor)].sort((x, y) => y - x);
      return (a + 0.05) / (b + 0.05);
    });
    expect(ratio).toBeGreaterThanOrEqual(4.5);
    const phone = info.project.name === "phone";
    await expect(page.getByRole("table", { name: "Members" })).toBeVisible({ visible: !phone });
    await expect(page.getByRole("list", { name: "Members" })).toBeVisible({ visible: phone });
    await expectNoHorizontalScroll(page);
  });

  test("before JavaScript: Send is disabled, and a forced submit puts nothing in the URL", async ({ page, context }, info) => {
    const { spaceId } = await setupAdmin(context, info);
    // Scripts never load, so the page stays as the server sent it.
    await page.route("**/_next/static/**", (route) => route.abort());
    await page.goto(invitationsUrl(spaceId));
    const form = page.getByTestId("invite-form");
    await expect(form).toBeVisible();
    await expect(page.getByTestId("send-invitation")).toBeDisabled();
    await expect(form).toHaveAttribute("method", "post");
    await page.locator("#invite-email").fill("leak-check@example.test");
    // requestSubmit() bypasses the disabled button: the worst case. The form posts to the page.
    const navigated = page.waitForEvent("framenavigated", (frame) => frame === page.mainFrame());
    await form.evaluate((f) => (f as HTMLFormElement).requestSubmit());
    await navigated;
    await page.waitForLoadState("load");
    expect(new URL(page.url()).search).toBe("");
    expect(decodeURIComponent(page.url())).not.toContain("leak-check");
    expect(await storedInvitations(spaceId)).toEqual([]);
  });
});

// ------------------------------------------------------------------------------------------------
// The accept page
// ------------------------------------------------------------------------------------------------

/** Records every request the page makes, with its headers and body, for the token checks. */
function recordRequests(page: Page) {
  const seen: { url: string; method: string; referer: string | undefined; body: string | null }[] = [];
  const pending: Promise<void>[] = [];
  // On "response", when the request's full headers (including Referer) are available.
  let open = true;
  page.on("response", (res) => {
    if (!open) return;
    const r: Request = res.request();
    pending.push(
      r
        .allHeaders()
        .then((h) => {
          seen.push({ url: r.url().split("#")[0], method: r.method(), referer: h["referer"], body: r.postData() });
        })
        // A response that lands as the page closes is not part of what the test checks.
        .catch(() => {}),
    );
  });
  return {
    async done() {
      await Promise.all(pending);
      open = false;
      return seen;
    },
  };
}

const storage = (page: Page) => page.evaluate(() => Object.fromEntries(Object.entries(window.sessionStorage)));

async function signInThroughTheForm(page: Page, email: string) {
  await page.locator("#email").fill(email);
  await page.locator("#password").fill("Goodpass1");
  await page.locator("main form").getByRole("button", { name: "Sign in", exact: true }).click();
}

test.describe("accept page", () => {
  test("signed in: preview, accept, the household is selected, and the token is never exposed", async ({ page, context }, info) => {
    const { invitee } = cast(info);
    const { spaceId } = await setupAdmin(context, info);
    await seed(invitee, { display_name: "Alex Lee" });
    const { token } = await seedInvitation({ space_id: spaceId, email: invitee.email });
    // The invitee, not the admin, is signed in on this page.
    await context.clearCookies();
    await signInAs(context, invitee);
    const requests = recordRequests(page);

    const response = await page.goto(`/invite#token=${token}`);
    // Referrer-Policy: no-referrer on the page itself.
    expect(response!.headers()["referrer-policy"]).toBe("no-referrer");
    await expect(page.getByRole("heading", { level: 1, name: `Join ${LEE}` })).toBeVisible();
    await expect(page.getByRole("main")).toContainText(`${INVITER} invited you. Once you join, you see what the household shares. Your personal records stay private.`);
    await expect(page.getByTestId("invite-signed-in-as")).toHaveText(`Signed in as ${invitee.email}.`);

    // The fragment is gone from the address bar and the token sits in this tab's sessionStorage only.
    expect(page.url()).not.toContain(token);
    expect(new URL(page.url()).hash).toBe("");
    expect(new URL(page.url()).search).toBe("");
    expect((await storage(page))[TOKEN_KEY]).toBe(token);
    // And nowhere in the page.
    expect(await page.content()).not.toContain(token);
    expect(await page.evaluate(() => document.cookie)).not.toContain(token);

    await page.getByTestId("invite-accept").click();
    await expect(page).toHaveURL(new RegExp(`/household/${spaceId}/members$`));
    await expect(page.getByRole("heading", { level: 1, name: LEE })).toBeVisible();
    await expect(page.getByTestId("toast")).toContainText(`You joined ${LEE}.`);
    // The joined household is the selected space (shell and cookie).
    await expect(page.getByRole("button", { name: `Active space: ${LEE}. Switch space.` })).toBeVisible();
    await expect.poll(async () => (await context.cookies()).find((c) => c.name === "hemfin-space")?.value).toBe(spaceId);

    // The token is cleared; the marker holds the household and no token.
    const after = await storage(page);
    expect(after[TOKEN_KEY]).toBeUndefined();
    const markerKey = Object.keys(after).find((k) => k.startsWith("hemfin-joined:"));
    expect(markerKey).toBeDefined();
    expect(JSON.parse(after[markerKey!])).toEqual({ spaceId, name: LEE });
    expect(JSON.stringify(after)).not.toContain(token);

    // What the browser sent: the token only in the body of preview and accept, never in a URL or a Referer.
    const seen = await requests.done();
    for (const r of seen) {
      expect(r.url, `${r.method} ${r.url}`).not.toContain(token);
      if (r.body?.includes(token)) expect(r.url).toMatch(/\/api\/v1\/invitations\/(preview|accept)$/);
    }
    const carrying = seen.filter((r) => r.body?.includes(token)).map((r) => new URL(r.url).pathname);
    expect(carrying).toEqual(["/api/v1/invitations/preview", "/api/v1/invitations/accept"]);
    // Requests made from /invite itself carry no Referer at all.
    for (const r of seen.filter((s) => s.url.includes("/api/v1/invitations/"))) expect(r.referer, r.url).toBeUndefined();
    // And the mock never saw it in a URL or a header.
    expect(await tokenLeaks(token)).toEqual([]);

    // Reopening /invite in this tab shows the joined state from the marker, never the generic message (6.8 K).
    await page.goto("/invite");
    await expect(page.getByRole("heading", { level: 1, name: `You joined ${LEE}` })).toBeVisible();
    await expect(page.getByTestId("invite-joined")).toBeVisible();
    await expect(page.getByText(GENERIC_TITLE)).toHaveCount(0);
    await page.reload();
    await expect(page.getByRole("heading", { level: 1, name: `You joined ${LEE}` })).toBeVisible();
    // "View members" leaves the flow and removes the marker; a later visit is the generic state.
    await page.getByRole("link", { name: "View members" }).click();
    await expect(page).toHaveURL(new RegExp(`/household/${spaceId}/members$`));
    expect(Object.keys(await storage(page)).filter((k) => k.startsWith("hemfin-joined:"))).toEqual([]);
    await page.goto("/invite");
    await expect(page.getByRole("heading", { level: 1, name: GENERIC_TITLE })).toBeVisible();
  });

  test("signed out: sign in carries the token through, and the URL never has it", async ({ page, context }, info) => {
    const { invitee } = cast(info);
    const { spaceId } = await setupAdmin(context, info);
    await seed(invitee, { display_name: "Alex Lee" });
    const { token } = await seedInvitation({ space_id: spaceId, email: invitee.email });
    await context.clearCookies(); // nobody is signed in
    const requests = recordRequests(page);

    await page.goto(`/invite#token=${token}`);
    await expect(page.getByRole("heading", { level: 1, name: "Join a household" })).toBeVisible();
    await expect(page.getByTestId("invite-signed-out")).toContainText("Only you can see personal records. Household members see only what the household shares.");
    expect(new URL(page.url()).hash).toBe("");
    // The preview is not called until sign-in.
    expect((await requests.done()).filter((r) => r.url.includes("/api/v1/invitations/"))).toEqual([]);

    await page.getByRole("link", { name: "Sign in", exact: true }).click();
    await expect(page).toHaveURL(/\/sign-in\?next=%2Finvite$/);
    expect(page.url()).not.toContain(token);
    expect((await storage(page))[TOKEN_KEY]).toBe(token);
    await signInThroughTheForm(page, invitee.email);

    await expect(page).toHaveURL(/\/invite$/);
    await expect(page.getByRole("heading", { level: 1, name: `Join ${LEE}` })).toBeVisible();
    await page.getByTestId("invite-accept").click();
    await expect(page).toHaveURL(new RegExp(`/household/${spaceId}/members$`));
    await expect(page.getByTestId("toast")).toContainText(`You joined ${LEE}.`);

    for (const r of await requests.done()) {
      expect(r.url).not.toContain(token);
      expect(decodeURIComponent(r.url)).not.toContain(token);
    }
    expect(await tokenLeaks(token)).toEqual([]);
  });

  test("signed out: Create an account keeps the token, pre-fills nothing, and shows none", async ({ page, context }, info) => {
    const { invitee } = cast(info);
    const { spaceId } = await setupAdmin(context, info);
    const { token } = await seedInvitation({ space_id: spaceId, email: invitee.email });
    await context.clearCookies();
    await page.goto(`/invite#token=${token}`);
    await page.getByRole("link", { name: "Create an account" }).click();
    await expect(page).toHaveURL(/\/sign-up\?next=%2Finvite$/);
    await expect(page.getByLabel("Email")).toHaveValue("");
    expect(await page.content()).not.toContain(token);
    expect((await storage(page))[TOKEN_KEY]).toBe(token);
    // Signing up goes to "check your email"; the token is still held for the return.
    await page.getByLabel("Email").fill(invitee.email);
    await page.locator("#password").fill("Goodpass1");
    await page.locator("main form").getByRole("button", { name: "Create account" }).click();
    await expect(page).toHaveURL(/\/check-email$/);
    expect((await storage(page))[TOKEN_KEY]).toBe(token);
  });

  test("wrong account: the same generic state as every other failure, and a way forward", async ({ page, context }, info) => {
    const { invitee, other } = cast(info);
    const { spaceId } = await setupAdmin(context, info);
    await seed(other, { display_name: "Someone Else" });
    const wrong = await seedInvitation({ space_id: spaceId, email: invitee.email });
    const expired = await seedInvitation({ space_id: spaceId, email: other.email, status: "expired" });
    const revoked = await seedInvitation({ space_id: spaceId, email: `r.${other.email}`, status: "revoked" });
    const declined = await seedInvitation({ space_id: spaceId, email: `d.${other.email}`, status: "declined" });
    await context.clearCookies();
    await signInAs(context, other);

    const snapshots: string[] = [];
    const cases = [wrong.token, expired.token, revoked.token, declined.token, "A".repeat(43) /* unknown */];
    for (const token of cases) {
      await page.goto(`/invite#token=${token}`);
      const generic = page.getByTestId("invite-generic");
      await expect(page.getByRole("heading", { level: 1, name: GENERIC_TITLE })).toBeVisible();
      await expect(page.getByRole("main")).toContainText(GENERIC_BODY);
      await expect(generic).toContainText(GENERIC_PATH);
      snapshots.push(await page.getByRole("main").innerText());
    }
    // Word for word the same text, whatever the reason.
    expect(new Set(snapshots).size).toBe(1);
    // A missing token is the same state.
    await page.goto("/invite");
    await expect(page.getByRole("heading", { level: 1, name: GENERIC_TITLE })).toBeVisible();
    expect(await page.getByRole("main").innerText()).toBe(snapshots[0]);
    // A token in the query string is not a token: same state, and the query string is removed.
    await page.goto(`/invite?token=${wrong.token}`);
    await expect(page.getByRole("heading", { level: 1, name: GENERIC_TITLE })).toBeVisible();
    expect(new URL(page.url()).search).toBe("");

    // Way forward: sign out here, stay on the page, sign in with the invited address, accept.
    await page.goto(`/invite#token=${wrong.token}`);
    await expect(page.getByRole("heading", { level: 1, name: GENERIC_TITLE })).toBeVisible();
    await page.getByTestId("invite-sign-out").click();
    await expect(page.getByRole("heading", { level: 1, name: "Join a household" })).toBeVisible();
    await expect(page).toHaveURL(/\/invite$/);
    expect(Object.keys(await storage(page)).filter((k) => k.startsWith("hemfin-") && k !== TOKEN_KEY)).toEqual([]);
    await page.getByRole("link", { name: "Sign in", exact: true }).click();
    await signInThroughTheForm(page, invitee.email);
    await expect(page.getByRole("heading", { level: 1, name: `Join ${LEE}` })).toBeVisible();
  });

  test("signed out with no token: the conditional sentence matches the only action, Sign in", async ({ page, context }) => {
    await context.clearCookies();
    await page.goto("/invite");
    await expect(page.getByRole("heading", { level: 1, name: GENERIC_TITLE })).toBeVisible();
    await expect(page.getByTestId("invite-generic")).toContainText(GENERIC_PATH_SIGNED_OUT);
    await expect(page.getByRole("main")).not.toContainText("sign out");
    await expect(page.getByTestId("invite-sign-out")).toHaveCount(0);
    await expect(page.getByRole("link", { name: "Sign in", exact: true })).toBeVisible();
  });

  test("opening another invitation link in the same tab takes the new token", async ({ page, context }, info) => {
    const { invitee } = cast(info);
    const { spaceId } = await setupAdmin(context, info);
    await seed(invitee, { display_name: "Alex Lee" });
    const { token } = await seedInvitation({ space_id: spaceId, email: invitee.email });
    await context.clearCookies();
    await signInAs(context, invitee);
    await page.goto(`/invite#token=${"B".repeat(43)}`);
    await expect(page.getByRole("heading", { level: 1, name: GENERIC_TITLE })).toBeVisible();
    // Only the fragment changes, so the page is not reloaded.
    await page.goto(`/invite#token=${token}`);
    await expect(page.getByRole("heading", { level: 1, name: `Join ${LEE}` })).toBeVisible();
    expect(new URL(page.url()).hash).toBe("");
  });

  test("decline: confirm dialog focuses Cancel, then the declined state and the admin sees Declined", async ({ page, context }, info) => {
    const { invitee } = cast(info);
    const { spaceId } = await setupAdmin(context, info);
    await seed(invitee, { display_name: "Alex Lee" });
    const { token } = await seedInvitation({ space_id: spaceId, email: invitee.email });
    await context.clearCookies();
    await signInAs(context, invitee);
    await page.goto(`/invite#token=${token}`);
    await page.getByTestId("invite-decline").click();
    const dialog = page.getByRole("alertdialog", { name: "Decline this invitation?" });
    await expect(dialog).toContainText(`${LEE} will not be joined. ${INVITER} can send another invitation.`);
    await expect(dialog.getByRole("button", { name: "Cancel" })).toBeFocused();
    await dialog.getByRole("button", { name: "Cancel" }).click();
    await expect(page.getByRole("heading", { level: 1, name: `Join ${LEE}` })).toBeVisible();

    await page.getByTestId("invite-decline").click();
    await page.getByTestId("invite-confirm-decline").click();
    const declined = page.getByRole("heading", { level: 1, name: "Invitation declined" });
    await expect(declined).toBeFocused();
    // The focused heading shows the focus ring (it is not outline: none).
    expect(await declined.evaluate((h) => getComputedStyle(h).outlineStyle)).not.toBe("none");
    expect(await declined.evaluate((h) => parseFloat(getComputedStyle(h).outlineWidth))).toBeGreaterThan(0);
    await expect(page.getByRole("main")).toContainText(`You did not join ${LEE}.`);
    expect((await storage(page))[TOKEN_KEY]).toBeUndefined();
    expect((await storedInvitations(spaceId))[0].status).toBe("declined");
    await page.getByRole("link", { name: "Go to dashboard" }).click();
    await expect(page).toHaveURL(/\/dashboard$/);
  });

  test("a server error is its own state with Try again, and a 401 returns to sign-in keeping the token", async ({ page, context }, info) => {
    const { invitee } = cast(info);
    const { spaceId } = await setupAdmin(context, info);
    await seed(invitee, { display_name: "Alex Lee" });
    const { token } = await seedInvitation({ space_id: spaceId, email: invitee.email });
    await context.clearCookies();
    await signInAs(context, invitee);

    await invitationMode(invitee, { fail_invitee: 500 });
    await page.goto(`/invite#token=${token}`);
    await expect(page.getByRole("heading", { level: 1, name: "We could not check your invitation" })).toBeVisible();
    await expect(page.getByRole("main")).toContainText("HemFin is having trouble right now. Try again in a few minutes.");
    await invitationMode(invitee, { fail_invitee: null });
    await page.getByTestId("invite-retry").click();
    await expect(page.getByRole("heading", { level: 1, name: `Join ${LEE}` })).toBeVisible();

    // The network drops: the reason is given, it is not the generic state.
    await page.route("**/api/v1/invitations/accept", (route) => route.abort());
    await page.getByTestId("invite-accept").click();
    await expect(page.getByRole("main")).toContainText("We could not reach HemFin. Check your connection and try again.");
    await page.unroute("**/api/v1/invitations/accept");

    // The API rejects the session: back to sign-in with the banner, token still held, next without a token.
    await invitationMode(invitee, { fail_invitee: 401 });
    await page.getByTestId("invite-retry").click();
    await expect(page).toHaveURL(/\/sign-in\?next=%2Finvite&reason=session$/);
    await expect(page.getByText("Sign in again to continue.")).toBeVisible();
    expect((await storage(page))[TOKEN_KEY]).toBe(token);
    expect(page.url()).not.toContain(token);
  });

  test("sign-out clears the joined marker and the token, so the next user sees neither", async ({ page, context }, info) => {
    const { invitee } = cast(info);
    const { spaceId } = await setupAdmin(context, info);
    await seed(invitee, { display_name: "Alex Lee" });
    const { token } = await seedInvitation({ space_id: spaceId, email: invitee.email });
    await context.clearCookies();
    await signInAs(context, invitee);
    await page.goto(`/invite#token=${token}`);
    await page.getByTestId("invite-accept").click();
    await expect(page).toHaveURL(new RegExp(`/household/${spaceId}/members$`));
    expect(Object.keys(await storage(page)).some((k) => k.startsWith("hemfin-joined:"))).toBe(true);
    // A stray token as well (a second, unused invitation opened in this tab).
    await page.evaluate((t) => sessionStorage.setItem("hemfin-invite-token", t), token);

    await page.getByRole("button", { name: "Sign out" }).click();
    await expect(page).toHaveURL(/\/sign-in/);
    expect(Object.keys(await storage(page)).filter((k) => k.startsWith("hemfin-"))).toEqual([]);
  });

  test("before JavaScript: the server HTML is the checking state, with no token and no API call", async ({ page }) => {
    const token = "T".repeat(43);
    const urls: string[] = [];
    page.on("request", (r) => urls.push(r.url()));
    // Scripts never load, so the page stays as the server sent it.
    await page.route("**/_next/static/**", (route) => route.abort());
    const response = await page.goto(`/invite#token=${token}`);
    expect(response!.headers()["referrer-policy"]).toBe("no-referrer");
    await expect(page.getByTestId("invite-checking")).toBeVisible();
    await expect(page.getByRole("heading", { level: 1, name: "Checking your invitation" })).toBeVisible();
    expect(urls.filter((u) => u.includes("/api/"))).toEqual([]);
    expect(urls.filter((u) => u.split("#")[0].includes(token))).toEqual([]);
    // The HTML the server sent has no token (the fragment never reaches it).
    expect((await response!.text()).includes(token)).toBe(false);
    // With scripts switched off entirely the page says what it needs.
    expect(await response!.text()).toContain("HemFin needs JavaScript on to open this invitation.");
  });

  for (const state of ["signed-out", "ready", "generic"] as const) {
    test(`layout: ${state} state has no horizontal scroll and 44 px targets`, async ({ page, context }, info) => {
      const { invitee } = cast(info);
      const { spaceId } = await setupAdmin(context, info);
      await seed(invitee, { display_name: "Alex Lee" });
      const { token } = await seedInvitation({ space_id: spaceId, email: invitee.email });
      await context.clearCookies();
      if (state !== "signed-out") await signInAs(context, invitee);
      await page.goto(state === "generic" ? "/invite" : `/invite#token=${token}`);
      await expect(page.getByRole("heading", { level: 1 })).toHaveText(
        state === "signed-out" ? "Join a household" : state === "ready" ? `Join ${LEE}` : GENERIC_TITLE,
      );
      await expectNoHorizontalScroll(page);
      await expectAllTapTargets(page.getByRole("main"));
    });
  }
});
