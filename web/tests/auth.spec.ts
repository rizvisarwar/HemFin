import { expect, test, type Page, type TestInfo } from "@playwright/test";
import { signInAs } from "./support/auth";

async function expectNoHorizontalScroll(page: Page) {
  const { scrollWidth, clientWidth } = await page.evaluate(() => ({
    scrollWidth: document.documentElement.scrollWidth,
    clientWidth: document.documentElement.clientWidth,
  }));
  expect(scrollWidth).toBeLessThanOrEqual(clientWidth);
}

async function shot(page: Page, info: TestInfo, name: string) {
  await page.screenshot({
    path: `test-results/screenshots/${info.project.name}-auth-${name}.png`,
    fullPage: true,
    animations: "disabled",
  });
}

/**
 * Opens a form page and waits for React to attach to it. Typing before hydration into a controlled
 * input is reset to its initial value when React takes over, so tests must not fill earlier.
 */
async function gotoHydrated(page: Page, path: string) {
  await page.goto(path);
  await page.waitForFunction(() => {
    const input = document.querySelector("form input");
    return !!input && Object.keys(input).some((k) => k.startsWith("__reactProps$"));
  });
}

const GOOD_PASSWORD = "Passw0rd-valid";

test.describe("route protection", () => {
  test("signed-out visit to an (app) route redirects to sign-in with next", async ({ page }) => {
    await page.goto("/contracts?tab=active");
    await expect(page).toHaveURL(/\/sign-in\?next=%2Fcontracts%3Ftab%3Dactive$/);
    await expect(page.getByRole("heading", { level: 1, name: "Sign in" })).toBeVisible();
  });

  test("every (app) route is protected", async ({ page }) => {
    for (const path of ["/dashboard", "/profile", "/household", "/documents"]) {
      await page.goto(path);
      await expect(page).toHaveURL(new RegExp(`/sign-in\\?next=${encodeURIComponent(path).replace(/%/g, "%")}`));
    }
  });

  test("a malicious next value is never followed", async ({ page }) => {
    await page.goto("/sign-in?next=https://evil.example/steal");
    await page.getByLabel("Email").fill("user@example.test");
    await page.getByLabel("Password", { exact: true }).fill(GOOD_PASSWORD);
    await page.getByRole("button", { name: "Sign in", exact: true }).click();
    await expect(page).toHaveURL(/127\.0\.0\.1:3100\/dashboard$/);
  });

  test("signed-in users are sent away from the auth pages", async ({ page, context }) => {
    await signInAs(context);
    for (const path of ["/sign-in", "/sign-up", "/forgot-password"]) {
      await page.goto(path);
      await expect(page).toHaveURL(/\/dashboard$/);
    }
  });

  test("a forged session cookie does not count as signed in", async ({ page, context }) => {
    const fake = { access_token: "a.b.c", refresh_token: "x", token_type: "bearer", expires_in: 3600, expires_at: 9999999999, user: { id: "x" } };
    await context.addCookies([
      { name: "sb-127-auth-token", value: `base64-${Buffer.from(JSON.stringify(fake)).toString("base64url")}`, url: "http://127.0.0.1:3100" },
    ]);
    await page.goto("/dashboard");
    await expect(page).toHaveURL(/\/sign-in\?next=%2Fdashboard$/);
  });
});

test.describe("sign in", () => {
  test("validation: inline errors, focus on the first invalid field, announced politely", async ({ page }, info) => {
    await gotoHydrated(page, "/sign-in");
    await page.getByRole("button", { name: "Sign in", exact: true }).click();
    const email = page.getByLabel("Email");
    await expect(email).toBeFocused();
    await expect(email).toHaveAttribute("aria-invalid", "true");
    await expect(page.getByText("Enter your email address, for example name@example.com.")).toBeVisible();
    await expect(page.getByText("Enter your password.")).toBeVisible();
    await expect(page.locator("#email-error")).toHaveAttribute("aria-live", "polite");
    await expectNoHorizontalScroll(page);
    await shot(page, info, "sign-in-errors");

    await email.fill("name@example.test");
    await page.getByRole("button", { name: "Sign in", exact: true }).click();
    await expect(page.getByLabel("Password", { exact: true })).toBeFocused();
  });

  test("form controls and links are at least 44 px tall", async ({ page }) => {
    await gotoHydrated(page, "/sign-in");
    const targets = [
      page.getByLabel("Email"),
      page.getByLabel("Password", { exact: true }),
      page.getByRole("button", { name: "Sign in", exact: true }),
      page.getByTestId("google-button"),
      page.getByRole("link", { name: "Forgot password?" }),
      page.getByRole("link", { name: "Create an account" }),
    ];
    for (const t of targets) {
      const box = await t.boundingBox();
      expect(box?.height).toBeGreaterThanOrEqual(44);
    }
  });

  test("wrong credentials show one generic message that does not reveal the account state", async ({ page }) => {
    await gotoHydrated(page, "/sign-in");
    await page.getByLabel("Email").fill("someone@example.test");
    await page.getByLabel("Password", { exact: true }).fill("wrong-Passw0rd");
    await page.getByRole("button", { name: "Sign in", exact: true }).click();
    const msg = page.getByTestId("form-message");
    await expect(msg).toContainText("We could not sign you in. Check your email and password.");
    await expect(msg).not.toContainText(/no account|not registered|does not exist|not found/i);
  });

  test("signing in lands on the dashboard, shows the real personal space, and sign out works", async ({ page }, info) => {
    await page.goto("/contracts");
    await expect(page).toHaveURL(/next=%2Fcontracts/);
    await page.getByLabel("Email").fill("user@example.test");
    await page.getByLabel("Password", { exact: true }).fill(GOOD_PASSWORD);
    await page.getByRole("button", { name: "Sign in", exact: true }).click();
    await expect(page).toHaveURL(/\/contracts$/); // back to where the user was going
    await expect(page.getByRole("button", { name: /Active space: Personal/ })).toBeVisible();
    await shot(page, info, "signed-in");

    await page.getByRole("button", { name: "Sign out" }).click();
    await expect(page).toHaveURL(/\/sign-in$/);
    await page.goto("/dashboard");
    await expect(page).toHaveURL(/\/sign-in\?next=/);
  });

  test("Google button follows the branding (label, mark, light surface)", async ({ page }, info) => {
    await gotoHydrated(page, "/sign-in");
    const btn = page.getByTestId("google-button");
    await expect(btn).toHaveText("Continue with Google");
    await expect(btn.locator("svg path")).toHaveCount(4);
    await expect(btn).toHaveCSS("background-color", "rgb(255, 255, 255)");
    await shot(page, info, "sign-in");
  });
});

test.describe("sign up", () => {
  test("shows the password rules live and blocks a weak password", async ({ page }, info) => {
    await gotoHydrated(page, "/sign-up");
    const rules = page.getByRole("list", { name: "Password rules" });
    await expect(rules).toContainText("At least 8 characters (not done yet)");
    await page.getByLabel("Email").fill("new@example.test");
    await page.getByLabel("Password", { exact: true }).fill("abc");
    await expect(rules).toContainText("A lowercase letter (done)");
    await expect(rules).toContainText("An uppercase letter (not done yet)");
    await page.getByRole("button", { name: "Create account" }).click();
    await expect(page.getByLabel("Password", { exact: true })).toBeFocused();
    await expect(page.getByText("Your password does not meet all the rules yet.")).toBeVisible();
    await expectNoHorizontalScroll(page);
    await shot(page, info, "sign-up-errors");
  });

  test("a valid sign-up goes to check your email, with resend on a cooldown", async ({ page }, info) => {
    await gotoHydrated(page, "/sign-up");
    await page.getByLabel("Email").fill("new@example.test");
    await page.getByLabel("Password", { exact: true }).fill(GOOD_PASSWORD);
    await page.getByRole("button", { name: "Create account" }).click();
    await expect(page).toHaveURL(/\/check-email$/);
    await expect(page.getByRole("heading", { level: 1, name: "Check your email" })).toBeVisible();
    await expect(page.getByText("new@example.test")).toBeVisible();
    await expect(page.getByTestId("resend")).toBeDisabled();
    await expect(page.getByTestId("resend")).toContainText(/Send again in \d+s/);
    await expectNoHorizontalScroll(page);
    await shot(page, info, "check-email");
  });
});

test.describe("forgot password", () => {
  test("validates the email, then always shows the same confirmation", async ({ page }, info) => {
    await gotoHydrated(page, "/forgot-password");
    await page.getByRole("button", { name: "Send reset link" }).click();
    await expect(page.getByLabel("Email")).toBeFocused();
    await expect(page.getByText("Enter your email address, for example name@example.com.")).toBeVisible();
    await page.getByLabel("Email").fill("anyone@example.test");
    await page.getByRole("button", { name: "Send reset link" }).click();
    await expect(page.getByTestId("form-message")).toContainText(
      "If an account exists for that email address, we have sent a link to reset the password.",
    );
    await expectNoHorizontalScroll(page);
    await shot(page, info, "forgot-password");
  });

  test("reset password page checks both passwords", async ({ page, context }, info) => {
    await signInAs(context); // the callback would have created this session from the email link
    await gotoHydrated(page, "/reset-password");
    await page.getByLabel("New password", { exact: true }).fill(GOOD_PASSWORD);
    await page.getByLabel("Confirm new password").fill("Different1-pass");
    await page.getByRole("button", { name: "Change password" }).click();
    await expect(page.getByLabel("Confirm new password")).toBeFocused();
    await expect(page.getByText("The two passwords do not match.")).toBeVisible();
    await expectNoHorizontalScroll(page);
    await shot(page, info, "reset-password");
  });
});

test.describe("callback", () => {
  test("a missing or bad code returns to sign-in with a generic message", async ({ page }) => {
    await page.goto("/auth/callback?next=https://evil.example");
    await expect(page).toHaveURL(/\/sign-in\?error=link$/);
    await expect(page.getByTestId("form-message")).toContainText("expired");
  });
});
