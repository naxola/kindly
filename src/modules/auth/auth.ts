import { betterAuth } from "better-auth";
import { drizzleAdapter } from "@better-auth/drizzle-adapter";
import { nextCookies } from "better-auth/next-js";
import { db } from "@/db/client";
import { authSchema } from "@/modules/auth/schema";

const secret = process.env.BETTER_AUTH_SECRET;

if (!secret) {
  throw new Error(
    "BETTER_AUTH_SECRET is not set. Copy .env.example to .env and set a " +
      "random secret (e.g. `openssl rand -base64 32`).",
  );
}

/**
 * Better Auth instance for Kindly.
 *
 * Scope for PKG-001: email + password only. No social/OAuth providers, no
 * organization plugin (see docs/DECISIONS.md for why Organization/
 * OrganizationMember are hand-rolled instead of using Better Auth's
 * `organization` plugin), no magic links, no 2FA — all out of scope until a
 * future package asks for them.
 *
 * `usePlural: true` makes the Drizzle adapter look for `users`, `sessions`,
 * `accounts`, `verifications` (matching docs/DATABASE.md) instead of
 * Better Auth's singular defaults (`user`, `session`, ...).
 */
export const auth = betterAuth({
  secret,
  baseURL: process.env.BETTER_AUTH_URL,
  database: drizzleAdapter(db, {
    provider: "pg",
    usePlural: true,
    schema: authSchema,
  }),
  emailAndPassword: {
    enabled: true,
  },
  // Must be last: lets server actions set the session cookie directly.
  plugins: [nextCookies()],
});

export type Auth = typeof auth;
