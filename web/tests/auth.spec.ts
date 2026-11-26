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
  // Move the pointer off the page first, so no button is captured in its hover (dimmed) state.
  await page.mouse.move(0, 0);
  await page.screenshot({
    path: `test-results/screenshots/${info.project.name}-auth-${name}.png`,
    fullPage: true,
    animations: "disabled",
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

test.describe("before JavaScript is ready", () => {
  // Every server-rendered auth form must be safe to submit without JavaScript: no value may
  // reach the URL (history, logs, referrers). Forms post, and the submit button is disabled until
  // hydration. requestSubmit() bypasses the disabled button, which is the worst case.
  const PAGES = ["/sign-in", "/sign-up", "/forgot-password", "/reset-password", "/check-email"];
  const SECRET_PASSWORD = "Leak-Passw0rd-9";
  const SECRET_EMAIL = "leak-check@example.test";

  for (const path of PAGES) {
    test(`${path}: a submit without JavaScript puts no form value in the URL`, async ({ page, context }) => {
      if (path === "/reset-password") await signInAs(context);
      await page.route("**/_next/static/**", (route) => route.abort());
      await page.goto(path);
      const form = page.locator("main form");
      // /sign-in and /sign-up are client-rendered (useSearchParams), so without JavaScript there is
      // no form at all and nothing can be submitted. The others are server-rendered.
      if ((await form.count()) === 0) {
        expect(["/sign-in", "/sign-up"]).toContain(path);
        return;
      }
      await expect(form).toBeVisible();
      await expect(form.locator('button[type="submit"]')).toBeDisabled();
      for (const input of await form.locator("input").all()) {
        const type = await input.getAttribute("type");
        await input.fill(type === "password" ? SECRET_PASSWORD : SECRET_EMAIL);
      }
      await form.evaluate((f) => (f as HTMLFormElement).requestSubmit());
      await page.waitForLoadState("load");
      await page.waitForTimeout(500);
      const url = page.url();
      expect(new URL(url).search, `${path} ended at ${url}`).toBe("");
      expect(url).not.toContain(SECRET_PASSWORD);
      expect(url).not.toContain("leak-check");
      expect(decodeURIComponent(url)).not.toContain(SECRET_EMAIL);
    });
  }

  for (const path of ["/reset-password"]) {
    test(`${path}: a password typed before hydration survives it`, async ({ page, context }) => {
      if (path === "/reset-password") await signInAs(context);
      // Hold the JS chunks back until the test lets them go.
      let release: () => void = () => {};
      const gate = new Promise<void>((resolve) => (release = resolve));
      await page.route("**/_next/static/**/*.js", async (route) => {
        await gate;
        await route.continue();
      });
      await page.goto(path, { waitUntil: "domcontentloaded" });
      const password = page.locator("#password");
      await password.fill(GOOD_PASSWORD);
      const submit = page.locator('main form button[type="submit"]');
      await expect(submit).toBeDisabled(); // not hydrated yet

      release();
      await expect(submit).toBeEnabled(); // hydrated
      await expect(password).toHaveValue(GOOD_PASSWORD);
      // The rules checklist counts what was typed earlier, without another keystroke.
      const rules = page.getByRole("list", { name: "Password rules" });
      await expect(rules).toContainText("At least 8 characters (done)");
      await expect(rules).toContainText("A number (done)");
    });
  }
});

test.describe("sign in", () => {
  test("validation: inline errors, focus on the first invalid field, announced politely", async ({ page }, info) => {
    await page.goto("/sign-in");
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
    await page.goto("/sign-in");
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

  test("wrong credentials show one generic message that does not reveal the account state", async ({ page }, info) => {
    await page.goto("/sign-in");
    await page.getByLabel("Email").fill("someone@example.test");
    await page.getByLabel("Password", { exact: true }).fill("wrong-Passw0rd");
    await page.getByRole("button", { name: "Sign in", exact: true }).click();
    const msg = page.getByTestId("form-message");
    await expect(msg).toContainText("We could not sign you in. Check your email and password.");
    await expect(msg).not.toContainText(/no account|not registered|does not exist|not found/i);
    // Both fields are invalid and described by the message (we never say which one was wrong).
    for (const field of [page.getByLabel("Email"), page.getByLabel("Password", { exact: true })]) {
      await expect(field).toHaveAttribute("aria-invalid", "true");
      await expect(field).toHaveAttribute("aria-describedby", /signin-form-error/);
    }
    await expect(msg).toHaveAttribute("id", "signin-form-error");
    await shot(page, info, "sign-in-wrong-credentials");
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

  test("Google button follows the branding (label, mark, light surface, Roboto Medium)", async ({ page }, info) => {
    await page.goto("/sign-in");
    const btn = page.getByTestId("google-button");
    await expect(btn).toHaveText("Continue with Google");
    await expect(btn.locator("svg path")).toHaveCount(4);
    await expect(btn).toHaveCSS("background-color", "rgb(255, 255, 255)");
    await expect(btn).toHaveCSS("font-family", /Roboto/);
    await expect(btn).toHaveCSS("font-weight", "500");
    await expect(btn).toHaveCSS("font-size", "14px");
    // Scoped to the button: the rest of the page stays on the app font.
    await expect(page.getByRole("heading", { level: 1 })).toHaveCSS("font-family", /^Inter/);
    await shot(page, info, "sign-in");
  });

  test("focus ring follows the design system: 2 px outline, 2 px offset", async ({ page }) => {
    await page.goto("/sign-in");
    for (const el of [page.getByLabel("Email"), page.getByRole("button", { name: "Sign in", exact: true })]) {
      await el.focus();
      const ring = await el.evaluate((node) => {
        const cs = getComputedStyle(node);
        return { width: cs.outlineWidth, style: cs.outlineStyle, offset: cs.outlineOffset, shadow: cs.boxShadow };
      });
      expect(ring.style).toBe("solid");
      expect(ring.width).toBe("2px");
      expect(ring.offset).toBe("2px");
    }
  });
});

test.describe("sign up", () => {
  test("shows the password rules live and blocks a weak password", async ({ page }, info) => {
    await page.goto("/sign-up");
    const rules = page.getByRole("list", { name: "Password rules" });
    await expect(rules).toContainText("At least 8 characters (not done yet)");
    await page.getByLabel("Email").fill("new@example.test");
    await page.getByLabel("Password", { exact: true }).fill("abc");
    await expect(rules).toContainText("A lowercase letter (done)");
    await expect(rules).toContainText("An uppercase letter (not done yet)");
    // A short polite summary follows once typing stops (not on every keystroke).
    await expect(page.getByTestId("password-rules-summary")).toHaveText("1 of 4 password rules met.");
    await page.getByRole("button", { name: "Create account" }).click();
    await expect(page.getByLabel("Password", { exact: true })).toBeFocused();
    await expect(page.getByText("Your password does not meet all the rules yet.")).toBeVisible();
    await expectNoHorizontalScroll(page);
    await shot(page, info, "sign-up-errors");
  });

  test("a valid sign-up goes to check your email, with resend on a cooldown", async ({ page }, info) => {
    await page.clock.install(); // so the 60 s cooldown can be fast-forwarded
    await page.goto("/sign-up");
    await page.getByLabel("Email").fill("new@example.test");
    await page.getByLabel("Password", { exact: true }).fill(GOOD_PASSWORD);
    await page.getByRole("button", { name: "Create account" }).click();
    await expect(page).toHaveURL(/\/check-email$/);
    await expect(page.getByRole("heading", { level: 1, name: "Check your email" })).toBeVisible();
    // Neutral wording that is true whether or not the address already has an account.
    await expect(page.getByText("If you can sign up with")).toContainText("new@example.test");
    await expect(page.getByText(/we've sent a link to confirm it/)).toBeVisible();
    await expectNoHorizontalScroll(page);
    await shot(page, info, "sign-up-success");
    await shot(page, info, "check-email");

    const resend = page.getByTestId("resend");
    await expect(resend).toHaveAttribute("aria-disabled", "true");
    await expect(resend).toContainText(/Send again in \d+s/);
    // The cooldown is explained in a visible sentence, in normal text colour.
    const note = page.getByTestId("cooldown-note");
    await expect(note).toContainText(/You can ask for another email in \d+ seconds?\./);
    await expect(note).not.toHaveCSS("opacity", "0.5");

    // aria-disabled keeps keyboard focus on the button, and activating it sends nothing.
    await resend.focus();
    await page.keyboard.press("Enter");
    await expect(resend).toBeFocused();
    await expect(resend).toContainText(/Send again in \d+s/);

    // When the cooldown ends it is announced politely, once.
    const announcement = page.getByTestId("cooldown-announcement");
    await expect(announcement).toHaveText("");
    await expect(announcement).toHaveAttribute("aria-live", "polite");
    await page.clock.runFor(61_000);
    await expect(announcement).toHaveText("You can send the email again now.");
    await expect(resend).not.toHaveAttribute("aria-disabled", "true");
    await expect(resend).toHaveText("Send the email again");
    await expect(note).toHaveCount(0);
  });
});

test.describe("forgot password", () => {
  test("validates the email, then always shows the same confirmation, then a cooldown", async ({ page }, info) => {
    await page.goto("/forgot-password");
    await page.getByRole("button", { name: "Send reset link" }).click();
    await expect(page.getByLabel("Email")).toBeFocused();
    await expect(page.getByText("Enter your email address, for example name@example.com.")).toBeVisible();
    await page.getByLabel("Email").fill("anyone@example.test");
    const send = page.getByTestId("send-reset");
    await send.click();
    await expect(page.getByTestId("form-message")).toContainText(
      "If an account exists for that email address, we have sent a link to reset the password.",
    );
    // Same cooldown pattern as check-email: aria-disabled, focus kept, visible sentence.
    await expect(send).toHaveAttribute("aria-disabled", "true");
    await expect(send).toBeFocused();
    await expect(page.getByTestId("cooldown-note")).toContainText(/You can ask for another email in \d+ seconds?\./);
    await send.press("Enter");
    await expect(send).toBeFocused();
    await expectNoHorizontalScroll(page);
    await shot(page, info, "forgot-password");
  });

  test("reset password page checks both passwords", async ({ page, context }, info) => {
    await signInAs(context); // the callback would have created this session from the email link
    await page.goto("/reset-password");
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
  test("a missing code returns to sign-in with a generic message", async ({ page }) => {
    await page.goto("/auth/callback?next=https://evil.example");
    await expect(page).toHaveURL(/\/sign-in\?error=link$/);
    await expect(page.getByTestId("form-message")).toContainText("expired");
  });

  test("a bad code returns to sign-in with the same generic message", async ({ page }) => {
    await page.goto("/auth/callback?code=bad&next=https://evil.example");
    await expect(page).toHaveURL(/\/sign-in\?error=link$/);
    await expect(page.getByTestId("form-message")).toContainText("expired");
  });
});

test.describe("themes and motion", () => {
  test("dark theme", async ({ page }, info) => {
    await page.emulateMedia({ colorScheme: "dark" });
    for (const [path, name] of [
      ["/sign-in", "sign-in-dark"],
      ["/sign-up", "sign-up-dark"],
      ["/forgot-password", "forgot-password-dark"],
    ]) {
      await page.goto(path);
      await expect(page.locator("html")).toHaveClass(/dark/);
      await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
      await expectNoHorizontalScroll(page);
      await shot(page, info, name);
    }
    // The Google button keeps its dark variant.
    await page.goto("/sign-in");
    await expect(page.getByTestId("google-button")).toHaveCSS("background-color", "rgb(19, 19, 20)");
  });

  test("reduced motion", async ({ page }, info) => {
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.goto("/sign-in");
    expect(await page.evaluate(() => matchMedia("(prefers-reduced-motion: reduce)").matches)).toBe(true);
    await shot(page, info, "sign-in-reduced-motion");
  });
});
