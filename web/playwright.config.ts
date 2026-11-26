import { defineConfig, devices } from "@playwright/test";

const PORT = 3100;
const MOCK_PORT = 3199;
const MOCK = `http://127.0.0.1:${MOCK_PORT}`;

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
    reducedMotion: "reduce", // sheets and menus appear without animation, so screenshots are stable
  },
  projects: [
    // Phone (375 px class): WebKit through the iPhone 13 profile.
    { name: "phone", use: { ...devices["iPhone 13"] } },
    // Tablet (768 px): icon rail.
    { name: "tablet", use: { ...devices["Desktop Chrome"], viewport: { width: 768, height: 1024 } } },
    // Desktop (1280 px): expanded sidebar.
    { name: "desktop", use: { ...devices["Desktop Chrome"], viewport: { width: 1280, height: 800 } } },
  ],
  webServer: [
    {
      // Stand-in for Supabase Auth and the API (tests/support/mock-backend.mjs), no Docker needed.
      command: "node tests/support/mock-backend.mjs",
      url: `${MOCK}/auth/v1/.well-known/jwks.json`,
      reuseExistingServer: !process.env.CI,
      timeout: 30_000,
      env: { MOCK_PORT: String(MOCK_PORT) },
      gracefulShutdown: { signal: "SIGTERM", timeout: 2000 },
    },
    {
      command: `npm run build && npm run start -- -p ${PORT} -H 127.0.0.1`,
      url: `http://127.0.0.1:${PORT}`,
      reuseExistingServer: !process.env.CI,
      timeout: 240_000,
      env: {
        // Both point at the mock. The landing page API badge reads "offline" because the mock's
        // /health is unhealthy on purpose.
        NEXT_PUBLIC_API_URL: MOCK,
        NEXT_PUBLIC_SUPABASE_URL: MOCK,
        NEXT_PUBLIC_SUPABASE_ANON_KEY: "mock-anon-key-for-tests",
      },
    },
  ],
});
