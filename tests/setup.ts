import "dotenv/config";

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
