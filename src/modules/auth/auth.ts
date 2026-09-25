import { betterAuth } from "better-auth";
import { drizzleAdapter } from "@better-auth/drizzle-adapter";
import { nextCookies } from "better-auth/next-js";
import { db } from "@/db/client";
import { authSchema } from "@/modules/auth/schema";
import { ensureOrganizationForUser } from "@/modules/organizations/bootstrap";
import { sendEmail } from "@/modules/email/sender";
import { vercelTrustedOrigins } from "@/modules/auth/trusted-origins";
import { buildPasswordResetEmail, PASSWORD_RESET_TOKEN_TTL_SECONDS } from "@/modules/auth/password-reset-email";

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
 * Scope for PKG-001: email + password only (plus password reset by email
 * since PKG-012). No social/OAuth providers, no
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
  trustedOrigins: vercelTrustedOrigins(),
  // Better Auth's default rate limiting (3 requests per 10s per IP on
  // /sign-up, /sign-in, ...) is disabled outside production — which is
  // exactly why it never showed up in `next dev` during PKG-001/002/003,
  // but does under `next build && next start`, the real production mode
  // Playwright's webServer always ran. Found while chasing PKG-004 E2E
  // flakiness: several specs registering different users from the same
  // machine IP within a few seconds tripped this real, working rate limit
  // — not a bug in bootstrap/session logic. `DISABLE_AUTH_RATE_LIMIT` is
  // set only by playwright.config.ts's webServer.env; absent everywhere
  // else, so real deployments keep the default protection. See
  // docs/DECISIONS.md, bloque "PKG-004".
  rateLimit: { enabled: process.env.DISABLE_AUTH_RATE_LIMIT !== "true" },
  database: drizzleAdapter(db, {
    provider: "pg",
    usePlural: true,
    schema: authSchema,
  }),
  emailAndPassword: {
    enabled: true,
    // PKG-012. Better Auth answers `/request-password-reset` identically
    // whether or not the email exists (no account enumeration) and
    // rate-limits it to 3 per minute per IP by default. A failed send is
    // logged by Better Auth, never surfaced to the requester.
    sendResetPassword: async ({ user, url }) => {
      await sendEmail(buildPasswordResetEmail({ to: user.email, name: user.name, url }));
    },
    resetPasswordTokenExpiresIn: PASSWORD_RESET_TOKEN_TTL_SECONDS,
    // Whoever reset the password may be locking out someone who had it.
    revokeSessionsOnPasswordReset: true,
  },
  databaseHooks: {
    user: {
      create: {
        // Every new user must end up in exactly one Organization so that
        // multi-tenant data has somewhere to belong. Since PKG-006 there
        // are two ways in: accepting a pending invitation (the invitee
        // joins the inviting Organization with the invited role), or, for
        // anyone signing up on their own, a brand-new Organization where
        // they are ADMIN. See src/modules/organizations/bootstrap.ts.
        after: async (user) => {
          await ensureOrganizationForUser(user.id, user.name, user.email);
        },
      },
    },
  },
  // Must be last: lets server actions set the session cookie directly.
  plugins: [nextCookies()],
});

export type Auth = typeof auth;
