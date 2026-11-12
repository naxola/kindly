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
import { changeMemberRole, getOrganization, renameOrganization } from "@/modules/organizations/service";

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

/**
 * UI-7: `changeMemberRole` (ORGANIZATION.md §4, approved 2026-09-26) and
 * `renameOrganization`. Permission checks (ADMIN-only) live in the Server
 * Action, not here — these tests are about the invariants the domain layer
 * itself must never violate regardless of who calls it: never leave an
 * organization with zero ADMINs, and never touch another organization's row.
 */
describe("changeMemberRole / renameOrganization (integration, real PostgreSQL)", () => {
  async function createOrgWithMember(role: "ADMIN" | "DELEGATE", name: string) {
    const [org] = await db.insert(organizations).values({ name: `${name}'s org` }).returning();
    const [user] = await db
      .insert(users)
      .values({ id: randomUUID(), name, email: `${randomUUID()}@example.com` })
      .returning();
    await db.insert(organizationMembers).values({ organizationId: org.id, userId: user.id, role });
    return { org, user };
  }

  async function roleOf(organizationId: string, userId: string) {
    const [row] = await db
      .select({ role: organizationMembers.role })
      .from(organizationMembers)
      .where(eq(organizationMembers.userId, userId));
    return row?.role ?? null;
  }

  it("promotes a DELEGATE to ADMIN", async () => {
    const { org } = await createOrgWithMember("ADMIN", "First Admin");
    const { user: delegate } = await createOrgWithMember("DELEGATE", "A Delegate");
    // Move the delegate into the same organization (createOrgWithMember always makes a fresh one).
    await db.update(organizationMembers).set({ organizationId: org.id }).where(eq(organizationMembers.userId, delegate.id));

    const updated = await changeMemberRole(org.id, delegate.id, "ADMIN");
    expect(updated.role).toBe("ADMIN");
    expect(await roleOf(org.id, delegate.id)).toBe("ADMIN");
  });

  it("demotes an ADMIN to DELEGATE when another ADMIN remains", async () => {
    const { org, user: firstAdmin } = await createOrgWithMember("ADMIN", "Staying Admin");
    const { user: secondAdmin } = await createOrgWithMember("ADMIN", "Leaving Admin");
    await db.update(organizationMembers).set({ organizationId: org.id }).where(eq(organizationMembers.userId, secondAdmin.id));

    await changeMemberRole(org.id, secondAdmin.id, "DELEGATE");
    expect(await roleOf(org.id, secondAdmin.id)).toBe("DELEGATE");
    expect(await roleOf(org.id, firstAdmin.id)).toBe("ADMIN");
  });

  it("refuses to demote the organization's only ADMIN, even themselves", async () => {
    const { org, user: soleAdmin } = await createOrgWithMember("ADMIN", "Sole Admin");

    await expect(changeMemberRole(org.id, soleAdmin.id, "DELEGATE")).rejects.toThrow(/al menos un ADMIN/);
    expect(await roleOf(org.id, soleAdmin.id)).toBe("ADMIN");
  });

  it("refuses to change the role of someone outside the organization", async () => {
    const { org } = await createOrgWithMember("ADMIN", "Owner Admin");
    const { user: outsider } = await createOrgWithMember("DELEGATE", "Outsider");

    await expect(changeMemberRole(org.id, outsider.id, "ADMIN")).rejects.toThrow(/no pertenece a esta organización/);
  });

  it("renames an organization", async () => {
    const { org } = await createOrgWithMember("ADMIN", "Renaming Admin");

    await renameOrganization(org.id, "  New Name  ");
    expect((await getOrganization(org.id))?.name).toBe("New Name");
  });

  it("refuses to rename an organization to a blank name", async () => {
    const { org } = await createOrgWithMember("ADMIN", "Blank Name Admin");

    await expect(renameOrganization(org.id, "   ")).rejects.toThrow(/no puede estar vacío/);
    expect((await getOrganization(org.id))?.name).toBe("Blank Name Admin's org");
  });
});
