import { defineConfig, devices } from "@playwright/test";

/**
 * PKG-001 only needs one happy-path E2E flow (see project/CURRENT_TASK.md):
 * register → login → protected route → logout. Real UI flows for
 * Inbox/CRM/etc. come in future packages with their own suites.
 */
export default defineConfig({
  testDir: "./tests/e2e",
  fullyParallel: false,
  retries: 0,
  reporter: [["list"]],
  use: {
    baseURL: "http://localhost:3000",
    trace: "retain-on-failure",
  },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
  ],
  webServer: {
    command: "npm run build && npm run start",
    url: "http://localhost:3000/login",
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
});
