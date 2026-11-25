import { defineConfig, devices } from "@playwright/test";

// Regression check for `next dev` (HEM-007). The main config tests the production build; dev mode
// has its own prerender checks and error overlay, so it is exercised separately:
//   npx playwright test -c playwright.dev.config.ts
const PORT = 3101;

export default defineConfig({
  testDir: "./tests-dev",
  outputDir: "./test-results/dev-artifacts",
  fullyParallel: false,
  workers: 1,
  forbidOnly: !!process.env.CI,
  reporter: [["list"]],
  use: {
    baseURL: `http://127.0.0.1:${PORT}`,
    trace: "retain-on-failure",
  },
  projects: [{ name: "dev-desktop", use: { ...devices["Desktop Chrome"] } }],
  webServer: {
    command: "node tests-dev/dev-server.mjs",
    url: `http://127.0.0.1:${PORT}`,
    reuseExistingServer: false,
    timeout: 120_000,
    env: {
      DEV_CHECK_PORT: String(PORT),
      // Unreachable on purpose, so the landing page API badge is deterministic ("offline").
      NEXT_PUBLIC_API_URL: "http://127.0.0.1:9",
    },
  },
});
