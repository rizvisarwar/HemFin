import { defineConfig, devices } from "@playwright/test";

const PORT = 3100;

export default defineConfig({
  testDir: "./tests",
  // Artifacts go in their own folder so screenshots in test-results/screenshots are kept between runs.
  outputDir: "./test-results/artifacts",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: [["list"], ["html", { open: "never" }]],
  use: {
    baseURL: `http://127.0.0.1:${PORT}`,
    trace: "retain-on-failure",
  },
  projects: [
    // Phone (375 px class): WebKit through the iPhone 13 profile.
    { name: "phone", use: { ...devices["iPhone 13"] } },
    // Tablet (768 px): icon rail.
    { name: "tablet", use: { ...devices["Desktop Chrome"], viewport: { width: 768, height: 1024 } } },
    // Desktop (1280 px): expanded sidebar.
    { name: "desktop", use: { ...devices["Desktop Chrome"], viewport: { width: 1280, height: 800 } } },
  ],
  webServer: {
    command: `npm run build && npm run start -- -p ${PORT} -H 127.0.0.1`,
    url: `http://127.0.0.1:${PORT}`,
    reuseExistingServer: !process.env.CI,
    timeout: 240_000,
    env: {
      // Unreachable on purpose, so the landing page API badge is deterministic ("offline").
      NEXT_PUBLIC_API_URL: "http://127.0.0.1:9",
    },
  },
});
