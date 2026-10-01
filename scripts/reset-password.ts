/**
 * Operator tool: set a new password for an existing email+password user,
 * directly in the database. Exists because Kindly sends no email yet, so
 * there is no self-service "forgot password" (see docs/DECISIONS.md).
 *
 * Usage (fish):  env DATABASE_URL='<url>' npm run auth:reset-password -- user@example.com
 * The new password is prompted for, never passed as an argument, so it
 * doesn't end up in shell history. All of the user's sessions are revoked.
 *
 * Uses Better Auth's own `hashPassword`, so the result is exactly what
 * sign-up would have stored.
 */
import "dotenv/config";
import { createInterface } from "node:readline/promises";
import postgres from "postgres";
import { hashPassword } from "better-auth/crypto";

const MIN_PASSWORD_LENGTH = 8; // Better Auth's default minPasswordLength.

async function main() {
  const email = process.argv[2]?.trim().toLowerCase();
  const databaseUrl = process.env.DATABASE_URL_UNPOOLED || process.env.DATABASE_URL;
  if (!email || !databaseUrl) {
    console.error("Usage: env DATABASE_URL='<url>' npm run auth:reset-password -- <email>");
    process.exit(1);
  }

  const sql = postgres(databaseUrl, { max: 1 });
  try {
    const [user] = await sql<{ id: string }[]>`select id from users where lower(email) = ${email}`;
    if (!user) {
      console.error(`No user with email ${email} in ${new URL(databaseUrl).host}.`);
      process.exit(1);
    }

    const rl = createInterface({ input: process.stdin, output: process.stdout });
    const password = await rl.question(`New password for ${email} (min ${MIN_PASSWORD_LENGTH} chars): `);
    rl.close();
    if (password.length < MIN_PASSWORD_LENGTH) {
      console.error("Password too short; nothing changed.");
      process.exit(1);
    }

    const hash = await hashPassword(password);
    const updated = await sql`
      update accounts set password = ${hash}, updated_at = now()
      where user_id = ${user.id} and provider_id = 'credential'
    `;
    if (updated.count === 0) {
      console.error("User has no email+password account; nothing changed.");
      process.exit(1);
    }
    const revoked = await sql`delete from sessions where user_id = ${user.id}`;
    console.log(`Password updated for ${email}; ${revoked.count} session(s) revoked.`);
  } finally {
    await sql.end();
  }
}

void main();
