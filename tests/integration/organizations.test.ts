import { randomUUID } from "node:crypto";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import postgres from "postgres";
import { drizzle, type PostgresJsDatabase } from "drizzle-orm/postgres-js";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import { eq } from "drizzle-orm";
import * as schema from "@/db/schema";
import { users } from "@/modules/auth/schema";
import { organizationMembers, organizations } from "@/modules/organizations/schema";
import { bootstrapOrganizationForUser } from "@/modules/organizations/bootstrap";

/**
 * Regression test for a real incident (2026-09-18): a user who registered
 * before the Organization-bootstrap hook shipped had a valid session but no
 * organization_members row, so every request to a protected route bounced
 * them back to /login with no error — indistinguishable from a wrong
 * password. The fix made getCurrentOrganizationMember self-heal by calling
 * bootstrapOrganizationForUser on demand.
 *
 * That fix immediately surfaced a second bug under concurrency: two
 * Server Components in the same request (the (app) layout and the page it
 * wraps) can both call the self-heal path for the same brand-new session,
 * racing to create an Organization — this test is what caught it landing
 * on `insert into organization_members` with a wrapped DrizzleQueryError
 * whose `.code` lived on `.cause`, not on the error itself.
 */

let client: ReturnType<typeof postgres>;
let db: PostgresJsDatabase<typeof schema>;

beforeAll(async () => {
  client = postgres(process.env.DATABASE_URL!, { max: 5 });
  db = drizzle(client, { schema });
  await migrate(db, {
    migrationsFolder: path.resolve(__dirname, "../../drizzle/migrations"),
  });
});

afterAll(async () => {
  await client.end();
});

describe("bootstrapOrganizationForUser (integration, real PostgreSQL)", () => {
  it("creates exactly one organization when called concurrently for the same user", async () => {
    const [user] = await db
      .insert(users)
      .values({ id: randomUUID(), name: "Concurrent User", email: `${randomUUID()}@example.com` })
      .returning();

    const results = await Promise.all(
      Array.from({ length: 8 }, () => bootstrapOrganizationForUser(user.id, user.name)),
    );

    // Exactly one caller should have won the race; the rest lose to the
    // unique constraint and return null instead of throwing.
    expect(results.filter((r) => r !== null)).toHaveLength(1);

    const memberships = await db
      .select()
      .from(organizationMembers)
      .where(eq(organizationMembers.userId, user.id));
    expect(memberships).toHaveLength(1);

    // The losing attempts must not leave orphaned `organizations` rows
    // behind (the transaction rolls back on the unique violation).
    const orgs = await db.select().from(organizations).where(eq(organizations.id, memberships[0].organizationId));
    expect(orgs).toHaveLength(1);
  });

  it("a second bootstrap call for an already-bootstrapped user returns null and leaves the original org untouched", async () => {
    const [user] = await db
      .insert(users)
      .values({ id: randomUUID(), name: "Already Bootstrapped", email: `${randomUUID()}@example.com` })
      .returning();

    const first = await bootstrapOrganizationForUser(user.id, user.name);
    expect(first).not.toBeNull();

    const second = await bootstrapOrganizationForUser(user.id, user.name);
    expect(second).toBeNull();

    const memberships = await db
      .select()
      .from(organizationMembers)
      .where(eq(organizationMembers.userId, user.id));
    expect(memberships).toHaveLength(1);
    expect(memberships[0].organizationId).toBe(first!.id);
  });
});
