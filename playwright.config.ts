import { defineConfig, devices } from "@playwright/test";

/**
 * PKG-001 only needed one happy-path E2E flow (register → login →
 * protected route → logout); PKG-002/003/004 added their own suites.
 *
 * `E2E_FAKE_MESSAGING_CHANNEL=true` is set only here — it makes the real
 * running server (started below with `next build && next start`) register
 * the test-only `FakeMessagingAdapter` (src/instrumentation.ts), which
 * tests/e2e/inbox.spec.ts needs to simulate a real inbound webhook end to
 * end. See docs/DECISIONS.md, bloque "PKG-004".
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
    env: {
      E2E_FAKE_MESSAGING_CHANNEL: "true",
      // Better Auth's default rate limiter is only active in production —
      // exactly the mode `next build && next start` runs — and a full E2E
      // suite registering several distinct users within a few seconds trips
      // it easily. See src/modules/auth/auth.ts and docs/DECISIONS.md.
      DISABLE_AUTH_RATE_LIMIT: "true",
    },
  },
});
