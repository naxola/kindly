import { randomUUID } from "node:crypto";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import postgres from "postgres";
import { drizzle, type PostgresJsDatabase } from "drizzle-orm/postgres-js";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import * as schema from "@/db/schema";
import { users } from "@/modules/auth/schema";
import { organizationMembers, organizations } from "@/modules/organizations/schema";
import { memberships } from "@/modules/memberships/schema";
import { createContact } from "@/modules/contacts/service";
import {
  createMembership,
  endMembership,
  getCurrentMembership,
  listMembershipHistory,
  updateMembership,
} from "@/modules/memberships/service";
import { listActivitiesForEntity } from "@/modules/audit/service";

/**
 * Integration tests for UI-10b (`docs/ui/CONVERSATION_WORKSPACE.md` §5.1,
 * `docs/DECISIONS.md` "Kindly no almacena archivos de afiliados...") —
 * against real PostgreSQL, same harness as `contact-assignments.test.ts`.
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

async function createOrgWithAdmin(name: string) {
  const [org] = await db.insert(organizations).values({ name: `${name}'s org` }).returning();
  const [admin] = await db
    .insert(users)
    .values({ id: randomUUID(), name: `${name} admin`, email: `${randomUUID()}@example.com` })
    .returning();
  await db.insert(organizationMembers).values({ organizationId: org.id, userId: admin.id, role: "ADMIN" });
  return { org, admin };
}

describe("UI-10b memberships (integration, real PostgreSQL)", () => {
  describe("createMembership", () => {
    it("gives a fresh Contact no Membership until alta", async () => {
      const { org, admin } = await createOrgWithAdmin("No Membership Org");
      const contact = await createContact({ organizationId: org.id, actorUserId: admin.id, name: "Marta" });

      expect(await getCurrentMembership(org.id, contact.id)).toBeNull();
    });

    it("alta creates an ACTIVE row and records MEMBERSHIP_CREATED", async () => {
      const { org, admin } = await createOrgWithAdmin("Alta Org");
      const contact = await createContact({ organizationId: org.id, actorUserId: admin.id, name: "Marta" });

      const created = await createMembership({
        organizationId: org.id,
        actorUserId: admin.id,
        contactId: contact.id,
        memberNumber: "48213",
        feePaidUntil: "2026-09-01",
      });

      expect(created.status).toBe("ACTIVE");
      expect(created.endedAt).toBeNull();
      expect(await getCurrentMembership(org.id, contact.id)).toMatchObject({ status: "ACTIVE", memberNumber: "48213" });

      const activities = await listActivitiesForEntity(org.id, "contact", contact.id);
      expect(activities.some((a) => a.type === "MEMBERSHIP_CREATED")).toBe(true);
    });

    it("refuses a second alta while one is already active", async () => {
      const { org, admin } = await createOrgWithAdmin("Double Alta Org");
      const contact = await createContact({ organizationId: org.id, actorUserId: admin.id, name: "Marta" });
      await createMembership({ organizationId: org.id, actorUserId: admin.id, contactId: contact.id });

      await expect(
        createMembership({ organizationId: org.id, actorUserId: admin.id, contactId: contact.id }),
      ).rejects.toThrow(/ya tiene una afiliación activa/);
    });

    it("refuses alta for a Contact outside the organization", async () => {
      const { org, admin } = await createOrgWithAdmin("Wrong Org");
      const { org: otherOrg, admin: otherAdmin } = await createOrgWithAdmin("Other Org");
      const contact = await createContact({ organizationId: otherOrg.id, actorUserId: otherAdmin.id, name: "Marta" });

      await expect(
        createMembership({ organizationId: org.id, actorUserId: admin.id, contactId: contact.id }),
      ).rejects.toThrow(/not found/);
    });
  });

  describe("updateMembership", () => {
    it("edits the open period in place, without starting a new one", async () => {
      const { org, admin } = await createOrgWithAdmin("Update Org");
      const contact = await createContact({ organizationId: org.id, actorUserId: admin.id, name: "Marta" });
      await createMembership({ organizationId: org.id, actorUserId: admin.id, contactId: contact.id, memberNumber: "1" });

      const updated = await updateMembership({
        organizationId: org.id,
        actorUserId: admin.id,
        contactId: contact.id,
        memberNumber: "2",
        feePaidUntil: "2026-10-01",
      });

      expect(updated).toMatchObject({ memberNumber: "2", feePaidUntil: "2026-10-01" });
      expect(await listMembershipHistory(org.id, contact.id)).toHaveLength(1);
    });

    it("returns null when there is no open period to edit", async () => {
      const { org, admin } = await createOrgWithAdmin("Update Noop Org");
      const contact = await createContact({ organizationId: org.id, actorUserId: admin.id, name: "Marta" });

      const updated = await updateMembership({
        organizationId: org.id,
        actorUserId: admin.id,
        contactId: contact.id,
        memberNumber: "1",
      });

      expect(updated).toBeNull();
    });
  });

  describe("endMembership and re-afiliación", () => {
    it("dar de baja closes the row and preserves it as history", async () => {
      const { org, admin } = await createOrgWithAdmin("Baja Org");
      const contact = await createContact({ organizationId: org.id, actorUserId: admin.id, name: "Marta" });
      await createMembership({ organizationId: org.id, actorUserId: admin.id, contactId: contact.id });

      const ended = await endMembership({ organizationId: org.id, actorUserId: admin.id, contactId: contact.id });
      expect(ended.status).toBe("INACTIVE");
      expect(ended.endedAt).not.toBeNull();

      const current = await getCurrentMembership(org.id, contact.id);
      expect(current?.status).toBe("INACTIVE");

      const activities = await listActivitiesForEntity(org.id, "contact", contact.id);
      expect(activities.some((a) => a.type === "MEMBERSHIP_ENDED")).toBe(true);
    });

    it("refuses a baja when there is no open period", async () => {
      const { org, admin } = await createOrgWithAdmin("Baja Noop Org");
      const contact = await createContact({ organizationId: org.id, actorUserId: admin.id, name: "Marta" });

      await expect(
        endMembership({ organizationId: org.id, actorUserId: admin.id, contactId: contact.id }),
      ).rejects.toThrow(/no tiene una afiliación activa/);
    });

    it("volver a afiliarse after a baja keeps both periods in history", async () => {
      const { org, admin } = await createOrgWithAdmin("Rejoin Org");
      const contact = await createContact({ organizationId: org.id, actorUserId: admin.id, name: "Marta" });
      await createMembership({ organizationId: org.id, actorUserId: admin.id, contactId: contact.id, memberNumber: "1" });
      await endMembership({ organizationId: org.id, actorUserId: admin.id, contactId: contact.id });

      const rejoined = await createMembership({
        organizationId: org.id,
        actorUserId: admin.id,
        contactId: contact.id,
        memberNumber: "1",
      });
      expect(rejoined.status).toBe("ACTIVE");

      const history = await listMembershipHistory(org.id, contact.id);
      expect(history).toHaveLength(2);
      expect(history[0].status).toBe("ACTIVE");
      expect(history[0].endedAt).toBeNull();
      expect(history[1].status).toBe("INACTIVE");
      expect(history[1].endedAt).not.toBeNull();

      expect((await getCurrentMembership(org.id, contact.id))?.status).toBe("ACTIVE");
    });

    it("prefers the open row over a closed one that shares the exact same startedAt", async () => {
      // The alta form only collects a *date* (`<input type=date>`), so a
      // same-day baja + "volver a afiliarse" produces two rows with an
      // identical startedAt — this reproduces that tie explicitly instead
      // of relying on defaultNow()'s sub-millisecond precision to differ.
      const { org, admin } = await createOrgWithAdmin("Tie Org");
      const contact = await createContact({ organizationId: org.id, actorUserId: admin.id, name: "Marta" });
      const sameDay = new Date("2026-09-29T00:00:00.000Z");

      await createMembership({ organizationId: org.id, actorUserId: admin.id, contactId: contact.id, startedAt: sameDay });
      await endMembership({ organizationId: org.id, actorUserId: admin.id, contactId: contact.id });
      await createMembership({ organizationId: org.id, actorUserId: admin.id, contactId: contact.id, startedAt: sameDay });

      const current = await getCurrentMembership(org.id, contact.id);
      expect(current?.status).toBe("ACTIVE");
      expect(current?.endedAt).toBeNull();
    });
  });

  describe("multi-tenant isolation", () => {
    it("a Membership never crosses organizations", async () => {
      const { org: orgA, admin: adminA } = await createOrgWithAdmin("Isolation A");
      const { org: orgB } = await createOrgWithAdmin("Isolation B");
      const contact = await createContact({ organizationId: orgA.id, actorUserId: adminA.id, name: "Marta" });
      await createMembership({ organizationId: orgA.id, actorUserId: adminA.id, contactId: contact.id });

      expect(await getCurrentMembership(orgB.id, contact.id)).toBeNull();

      const [row] = await db.select().from(memberships).where(eq(memberships.contactId, contact.id));
      expect(row.organizationId).toBe(orgA.id);
    });
  });
});
