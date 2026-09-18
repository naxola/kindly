import { randomUUID } from "node:crypto";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import postgres from "postgres";
import { drizzle, type PostgresJsDatabase } from "drizzle-orm/postgres-js";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import { sql } from "drizzle-orm";
import * as schema from "@/db/schema";
import { organizationMembers, organizations } from "@/modules/organizations/schema";
import { users } from "@/modules/auth/schema";

/**
 * Integration test: runs the real Drizzle migration against a real
 * PostgreSQL database (tests/setup.ts points DATABASE_URL at
 * TEST_DATABASE_URL) and checks the invariants PKG-001 promises —
 * see project/CURRENT_TASK.md acceptance criteria 5 and 7.
 */

let client: ReturnType<typeof postgres>;
let db: PostgresJsDatabase<typeof schema>;

beforeAll(async () => {
  client = postgres(process.env.DATABASE_URL!, { max: 1 });
  db = drizzle(client, { schema });
  await migrate(db, {
    migrationsFolder: path.resolve(__dirname, "../../drizzle/migrations"),
  });
});

afterAll(async () => {
  await client.end();
});

describe("PKG-001 Foundation schema (integration, real PostgreSQL)", () => {
  it("creates users, organizations and organization_members with their columns", async () => {
    const tables = await db.execute<{ table_name: string }>(sql`
      select table_name from information_schema.tables
      where table_schema = 'public'
      order by table_name
    `);
    const tableNames = tables.map((row) => row.table_name);

    expect(tableNames).toEqual(
      expect.arrayContaining([
        "accounts",
        "organization_members",
        "organizations",
        "sessions",
        "users",
        "verifications",
      ]),
    );
  });

  it("rejects a role outside ADMIN/DELEGATE at the database level", async () => {
    const [org] = await db.insert(organizations).values({ name: "Test Org" }).returning();
    const [user] = await db
      .insert(users)
      .values({ id: randomUUID(), name: "Test User", email: `${randomUUID()}@example.com` })
      .returning();

    await expect(
      db.execute(sql`
        insert into organization_members (organization_id, user_id, role)
        values (${org.id}, ${user.id}, 'OWNER')
      `),
    ).rejects.toThrow();
  });

  it("prevents the same user from belonging to an organization twice", async () => {
    const [org] = await db.insert(organizations).values({ name: "Test Org 2" }).returning();
    const [user] = await db
      .insert(users)
      .values({ id: randomUUID(), name: "Test User 2", email: `${randomUUID()}@example.com` })
      .returning();

    await db.insert(organizationMembers).values({
      organizationId: org.id,
      userId: user.id,
      role: "ADMIN",
    });

    await expect(
      db.insert(organizationMembers).values({
        organizationId: org.id,
        userId: user.id,
        role: "DELEGATE",
      }),
    ).rejects.toThrow();
  });

  it("deletes memberships when the organization is deleted (FK cascade)", async () => {
    const [org] = await db.insert(organizations).values({ name: "Test Org 3" }).returning();
    const [user] = await db
      .insert(users)
      .values({ id: randomUUID(), name: "Test User 3", email: `${randomUUID()}@example.com` })
      .returning();

    await db.insert(organizationMembers).values({
      organizationId: org.id,
      userId: user.id,
      role: "DELEGATE",
    });

    await db.delete(organizations).where(sql`${organizations.id} = ${org.id}`);

    const remaining = await db
      .select()
      .from(organizationMembers)
      .where(sql`${organizationMembers.organizationId} = ${org.id}`);

    expect(remaining).toHaveLength(0);
  });
});
