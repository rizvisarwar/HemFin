import { defineConfig, devices } from "@playwright/test";

// Regression check for `next dev` (HEM-007). The main config tests the production build; dev mode
// has its own prerender checks and error overlay, so it is exercised separately:
//   npx playwright test -c playwright.dev.config.ts
const PORT = 3101;
const MOCK = "http://127.0.0.1:3199";

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
  webServer: [
    {
      // Stand-in for Supabase Auth and the API (tests/support/mock-backend.mjs), so a signed-in
      // (app) route can render under `next dev`. Same port as the main config; they never run together.
      command: "node tests/support/mock-backend.mjs",
      url: `${MOCK}/auth/v1/.well-known/jwks.json`,
      reuseExistingServer: false,
      timeout: 30_000,
      env: { MOCK_PORT: "3199" },
      gracefulShutdown: { signal: "SIGTERM", timeout: 2000 },
    },
    {
      command: "node tests-dev/dev-server.mjs",
      url: `http://127.0.0.1:${PORT}`,
      reuseExistingServer: false,
      timeout: 120_000,
      env: {
        DEV_CHECK_PORT: String(PORT),
        // The mock's /health is unhealthy on purpose, so the landing page API badge is "offline".
        NEXT_PUBLIC_API_URL: MOCK,
        NEXT_PUBLIC_SUPABASE_URL: MOCK,
        NEXT_PUBLIC_SUPABASE_ANON_KEY: "mock-anon-key-for-tests",
      },
    },
  ],
});
