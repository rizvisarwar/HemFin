import { expect, test, type BrowserContext, type Page, type TestInfo } from "@playwright/test";
import { failLists, invitationMode, seed, seedHouseholds, seedInvitation, signInAs, uniqueUser } from "./support/auth";

// HEM-016 design-review screenshots: every state in docs/design/households.md 6.4, 6.6 and 6.8 that
// this ticket builds, in light and dark, at the three viewports. They land in
// test-results/screenshots/hem016/<project>/<state>-<light|dark>.png and double as a check that each
// state renders.

const LEE = "The Lee family";

async function snap(page: Page, info: TestInfo, name: string, opts: { view?: boolean } = {}) {
  for (const scheme of ["light", "dark"] as const) {
    await page.emulateMedia({ colorScheme: scheme });
    if (scheme === "dark") await expect(page.locator("html")).toHaveClass(/dark/);
    else await expect(page.locator("html")).not.toHaveClass(/dark/);
    await page.mouse.move(0, 0); // no button captured in its hover state
    await page.screenshot({
      path: `test-results/screenshots/hem016/${info.project.name}/${name}-${scheme}.png`,
      fullPage: !opts.view,
      animations: "disabled",
    });
  }
  await page.emulateMedia({ colorScheme: "light" });
}

function cast(info: TestInfo) {
  const admin = uniqueUser(info);
  const base = admin.email.replace("@example.test", "");
  return {
    admin,
    invitee: { email: `alex.${base}@example.test` },
    other: { email: `other.${base}@example.test` },
    sam: `sam.${base}@example.test`,
    taylor: `taylor.${base}@example.test`,
    jordan: `jordan.${base}@example.test`,
  };
}

async function setupAdmin(context: BrowserContext, info: TestInfo) {
  const { admin } = cast(info);
  await seed(admin, { display_name: "Jordan Kim" });
  const { ids } = await seedHouseholds(admin, [{ name: LEE, role: "owner" }]);
  await signInAs(context, admin);
  return { admin, spaceId: ids[0] };
}

const heading = (page: Page, name: string | RegExp) => page.getByRole("heading", { level: 1, name });

test.describe.configure({ timeout: 120_000 });

test.describe("invitations screens (admin)", () => {
  test("empty, filled form, validation and the sent message", async ({ page, context }, info) => {
    const { spaceId } = await setupAdmin(context, info);
    const { sam } = cast(info);
    await page.goto(`/household/${spaceId}/invitations`);
    await expect(page.getByTestId("invitations-empty")).toBeVisible();
    await snap(page, info, "invitations-empty");

    await page.getByTestId("send-invitation").click();
    await expect(page.getByText("Enter the email address to invite.")).toBeVisible();
    await snap(page, info, "invitations-validation");

    await page.locator("#invite-email").fill(sam);
    await page.getByRole("radio", { name: /Admin/ }).check();
    await snap(page, info, "invitations-form-filled");

    await page.getByTestId("send-invitation").click();
    await expect(page.locator("#invite-notice")).toContainText("Invitation sent to");
    await snap(page, info, "invitations-sent");
  });

  test("populated list with every status", async ({ page, context }, info) => {
    const { spaceId } = await setupAdmin(context, info);
    const { sam, taylor, jordan } = cast(info);
    await seedInvitation({ space_id: spaceId, email: `revoked.${jordan}`, status: "revoked" });
    await seedInvitation({ space_id: spaceId, email: `declined.${jordan}`, status: "declined" });
    await seedInvitation({ space_id: spaceId, email: jordan, status: "accepted" });
    await seedInvitation({ space_id: spaceId, email: taylor, status: "expired", role: "admin" });
    await seedInvitation({ space_id: spaceId, email: sam });
    await page.goto(`/household/${spaceId}/invitations`);
    await expect(page.getByTestId("invitations-error")).toHaveCount(0);
    await expect(page.locator("[data-slot=status-chip]").filter({ visible: true })).toHaveCount(5);
    await snap(page, info, "invitations-list");
    await snap(page, info, "invitations-list-viewport", { view: true });
  });

  test("conflicts: already a member and already invited", async ({ page, context }, info) => {
    const { spaceId } = await setupAdmin(context, info);
    const { taylor } = cast(info);
    await seedInvitation({ space_id: spaceId, email: taylor });
    await page.goto(`/household/${spaceId}/invitations`);
    await page.locator("#invite-email").fill(taylor);
    await page.getByTestId("send-invitation").click();
    await expect(page.locator("#invite-email-error")).toContainText("already a pending invitation");
    await snap(page, info, "invitations-409-already-invited");
  });

  test("email not sent, email not configured", async ({ page, context }, info) => {
    const { admin, spaceId } = await setupAdmin(context, info);
    const { sam } = cast(info);
    await page.goto(`/household/${spaceId}/invitations`);
    await invitationMode(admin, { email_mode: "not_sent" });
    await page.locator("#invite-email").fill(sam);
    await page.getByTestId("send-invitation").click();
    await expect(page.locator("#invite-notice")).toContainText("We saved the invitation but couldn't send the email.");
    await expect(page.getByTestId("invitation-email").filter({ visible: true })).toHaveText(sam);
    await snap(page, info, "invitations-503-email-not-sent");

    await invitationMode(admin, { email_mode: "unconfigured" });
    await page.locator("#invite-email").fill(`other.${sam}`);
    await page.getByTestId("send-invitation").click();
    await expect(page.locator("#invite-notice")).toContainText("Invitations are not available right now.");
    await snap(page, info, "invitations-503-unavailable");
  });

  test("resent, rate limited (countdown and daily cap), revoke dialog and revoked", async ({ page, context }, info) => {
    const { spaceId } = await setupAdmin(context, info);
    const { sam, taylor, jordan } = cast(info);
    await seedInvitation({ space_id: spaceId, email: jordan, resend_count: 3 });
    await seedInvitation({ space_id: spaceId, email: taylor, last_sent_seconds_ago: 30 });
    await seedInvitation({ space_id: spaceId, email: sam });
    await page.goto(`/household/${spaceId}/invitations`);
    const row = (email: string) =>
      page.locator('[data-testid="invitation-row"], [data-testid="invitation-card"]').filter({ visible: true }).filter({ hasText: email });

    await row(sam).getByRole("button", { name: /^Resend/ }).click();
    await expect(row(sam)).toContainText("Invitation resent. The old link no longer works.");
    await row(taylor).getByRole("button", { name: /^Resend/ }).click();
    await expect(row(taylor).getByTestId("resend-wait")).toBeVisible();
    await row(jordan).getByRole("button", { name: /^Resend/ }).click();
    await expect(row(jordan)).toContainText("up to 3 times a day");
    await snap(page, info, "invitations-resend-states");

    await row(sam).getByRole("button", { name: /^Revoke/ }).click();
    await expect(page.getByRole("alertdialog")).toBeVisible();
    await snap(page, info, "invitations-revoke-dialog", { view: true });
    await page.getByTestId("confirm-revoke").click();
    await expect(page.locator("#invitations-list-notice")).toContainText("Invitation revoked.");
    await snap(page, info, "invitations-revoked");
  });

  test("list error", async ({ page, context }, info) => {
    const { admin, spaceId } = await setupAdmin(context, info);
    await invitationMode(admin, { fail_invitations_list: true });
    await page.goto(`/household/${spaceId}/invitations`);
    await expect(page.getByTestId("invitations-error")).toBeVisible();
    await snap(page, info, "invitations-list-error");
  });

  test("loading skeletons", async ({ page, context }, info) => {
    test.skip(info.project.name === "phone", "WebKit hides streamed fallbacks until the stream ends");
    const { admin, spaceId } = await setupAdmin(context, info);
    await failLists(admin, { delay_ms: 8000 });
    await page.goto(`/household/${spaceId}/invitations`, { waitUntil: "commit" });
    await expect(page.getByTestId("invitations-loading")).toBeVisible();
    await snap(page, info, "invitations-loading");
  });

  test("members on the shared DataTable and ResponsiveList", async ({ page, context }, info) => {
    const { admin } = cast(info);
    await seed(admin, { display_name: "Jordan Kim" });
    const { ids } = await seedHouseholds(admin, [
      {
        name: LEE,
        role: "owner",
        members: [
          { email: cast(info).jordan, display_name: "Sam Lee", role: "admin" },
          { email: cast(info).sam, display_name: "Taylor Reid", role: "member" },
        ],
      },
    ]);
    await signInAs(context, admin);
    await page.goto(`/household/${ids[0]}/members`);
    await expect(page.getByTestId("members")).toBeVisible();
    await snap(page, info, "members");
  });
});

test.describe("accept page screens", () => {
  async function invited(context: BrowserContext, info: TestInfo, options: { signedIn: boolean }) {
    const { invitee } = cast(info);
    const { spaceId } = await setupAdmin(context, info);
    await seed(invitee, { display_name: "Alex Lee" });
    const { token } = await seedInvitation({ space_id: spaceId, email: invitee.email });
    await context.clearCookies();
    if (options.signedIn) await signInAs(context, invitee);
    return { token, spaceId, invitee };
  }

  test("A checking, B signed out", async ({ page, context }, info) => {
    const { token } = await invited(context, info, { signedIn: true });
    // Hold the preview back so the checking state stays on screen.
    let release: () => void = () => {};
    const gate = new Promise<void>((resolve) => (release = resolve));
    await page.route("**/api/v1/invitations/preview", async (route) => {
      await gate;
      await route.continue();
    });
    await page.goto(`/invite#token=${token}`);
    await expect(page.getByTestId("invite-checking")).toBeVisible();
    await snap(page, info, "accept-A-checking");
    release();
    await expect(heading(page, `Join ${LEE}`)).toBeVisible();

    await context.clearCookies();
    await page.goto("/"); // a new document: going to the same path with a new fragment would not reload
    await page.goto(`/invite#token=${token}`);
    await expect(heading(page, "Join a household")).toBeVisible();
    await snap(page, info, "accept-B-signed-out");
  });

  test("C signed in, D decline dialog, E accepting, G declined", async ({ page, context }, info) => {
    const { token } = await invited(context, info, { signedIn: true });
    await page.goto(`/invite#token=${token}`);
    await expect(heading(page, `Join ${LEE}`)).toBeVisible();
    await snap(page, info, "accept-C-signed-in");

    await page.getByTestId("invite-decline").click();
    await expect(page.getByRole("alertdialog")).toBeVisible();
    await snap(page, info, "accept-D-decline-dialog", { view: true });
    await page.getByRole("button", { name: "Cancel" }).click();

    // E: the accept call is held back, so the busy state shows.
    let release: () => void = () => {};
    const gate = new Promise<void>((resolve) => (release = resolve));
    await page.route("**/api/v1/invitations/accept", async (route) => {
      await gate;
      await route.fulfill({ status: 500, contentType: "application/problem+json", body: "{}" });
    });
    await page.getByTestId("invite-accept").click();
    await expect(page.getByTestId("invite-accept")).toHaveText("Joining…");
    await snap(page, info, "accept-E-accepting");
    release();
    await expect(heading(page, "We could not check your invitation")).toBeVisible();
    await snap(page, info, "accept-I-server-error");
    await page.unroute("**/api/v1/invitations/accept");

    await page.getByTestId("invite-retry").click();
    await expect(heading(page, `Join ${LEE}`)).toBeVisible();
    await page.getByTestId("invite-decline").click();
    await page.getByTestId("invite-confirm-decline").click();
    await expect(heading(page, "Invitation declined")).toBeVisible();
    await snap(page, info, "accept-G-declined");
  });

  test("F joined, the members page with its toast, and H generic", async ({ page, context }, info) => {
    const { token, spaceId } = await invited(context, info, { signedIn: true });
    await page.goto(`/invite#token=${token}`);
    await page.getByTestId("invite-accept").click();
    await expect(page).toHaveURL(new RegExp(`/household/${spaceId}/members$`));
    await expect(page.getByTestId("toast")).toBeVisible();
    await snap(page, info, "accept-K-members-toast", { view: true });

    await page.goto("/invite");
    await expect(heading(page, `You joined ${LEE}`)).toBeVisible();
    await snap(page, info, "accept-F-joined");
    await page.getByRole("link", { name: "View members" }).click();
    await page.goto("/invite");
    await expect(heading(page, "This invitation can't be used")).toBeVisible();
    await snap(page, info, "accept-H-generic-signed-in");

    await page.getByTestId("invite-sign-out").click();
    await expect(heading(page, "This invitation can't be used")).toBeVisible();
    await snap(page, info, "accept-H-generic-signed-out");
  });

  test("I network error and J session ended", async ({ page, context }, info) => {
    const { token, invitee } = await invited(context, info, { signedIn: true });
    await page.route("**/api/v1/invitations/preview", (route) => route.abort());
    await page.goto(`/invite#token=${token}`);
    await expect(heading(page, "We could not check your invitation")).toBeVisible();
    await snap(page, info, "accept-I-network-error");
    await page.unroute("**/api/v1/invitations/preview");

    await invitationMode(invitee, { fail_invitee: 401 });
    await page.getByTestId("invite-retry").click();
    await expect(page.getByText("Sign in again to continue.")).toBeVisible();
    await snap(page, info, "accept-J-session-ended");
  });
});
