import "dotenv/config";
import { afterEach } from "vitest";
import { cleanup } from "@testing-library/react";
// Extends `expect` with DOM matchers (toBeVisible, toHaveAttribute, …) for
// tests/components/**. Harmless for node-environment unit/integration
// tests — it only adds matchers, it doesn't touch globals they'd notice.
import "@testing-library/jest-dom/vitest";

// RTL's auto-cleanup only self-registers when `afterEach` is a real global
// (e.g. Jest); this config doesn't set `test.globals: true`, so it's wired
// by hand. Without it, a component test's DOM survives into the next test
// in the same file — `screen` queries the whole document, so a second
// render finds its own rows plus every earlier test's leftovers. A no-op
// when nothing was rendered, so it's safe in every test file.
afterEach(() => {
  cleanup();
});

/**
 * Route every module that reads `DATABASE_URL` (src/db/client.ts,
 * src/modules/auth/auth.ts) at the dedicated test database instead of the
 * local dev database. Must run before any test file imports those modules
 * — Vitest guarantees `setupFiles` execute first.
 */
if (process.env.TEST_DATABASE_URL) {
  process.env.DATABASE_URL = process.env.TEST_DATABASE_URL;
}

if (!process.env.BETTER_AUTH_SECRET) {
  process.env.BETTER_AUTH_SECRET = "test-secret-not-for-production-use-only";
}

if (!process.env.BETTER_AUTH_URL) {
  process.env.BETTER_AUTH_URL = "http://localhost:3000";
}
