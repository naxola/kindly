import { randomUUID } from "node:crypto";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import postgres from "postgres";
import { drizzle, type PostgresJsDatabase } from "drizzle-orm/postgres-js";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import * as schema from "@/db/schema";
import { users } from "@/modules/auth/schema";
import { organizationMembers, organizations } from "@/modules/organizations/schema";
import { createContact, getContact, listContacts, updateContact } from "@/modules/contacts/service";
import { createCase, getCase, updateCase } from "@/modules/cases/service";
import { createTask, updateTask } from "@/modules/tasks/service";
import { listActivitiesForEntity } from "@/modules/audit/service";

/**
 * Integration tests for PKG-002 (CRM básico): CRUD + Activity logging
 * against a real PostgreSQL database, and — the acceptance criterion that
 * matters most — multi-tenant isolation between two organizations.
 *
 * Fixtures insert users/organizations directly via Drizzle instead of going
 * through Better Auth: auth itself is already covered by
 * tests/integration/auth-flow.test.ts, this file only needs *some*
 * organization to hang Contacts/Cases/Tasks off of.
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

async function createTestUserAndOrg(name: string) {
  const [user] = await db
    .insert(users)
    .values({ id: randomUUID(), name, email: `${randomUUID()}@example.com` })
    .returning();
  const [org] = await db.insert(organizations).values({ name: `${name}'s org` }).returning();
  await db.insert(organizationMembers).values({ organizationId: org.id, userId: user.id, role: "ADMIN" });
  return { user, org };
}

describe("PKG-002 CRM services (integration, real PostgreSQL)", () => {
  it("creates a contact and logs CONTACT_CREATED", async () => {
    const { user, org } = await createTestUserAndOrg("Contact Owner");
    const contact = await createContact({ organizationId: org.id, actorUserId: user.id, name: "Ada Lovelace" });
    expect(contact.name).toBe("Ada Lovelace");

    const activities = await listActivitiesForEntity(org.id, "contact", contact.id);
    expect(activities.map((a) => a.type)).toContain("CONTACT_CREATED");
  });

  it("updates a contact and logs CONTACT_UPDATED", async () => {
    const { user, org } = await createTestUserAndOrg("Contact Editor");
    const contact = await createContact({ organizationId: org.id, actorUserId: user.id, name: "Original" });

    const updated = await updateContact({
      organizationId: org.id,
      actorUserId: user.id,
      contactId: contact.id,
      name: "Updated",
    });
    expect(updated?.name).toBe("Updated");

    const activities = await listActivitiesForEntity(org.id, "contact", contact.id);
    expect(activities.map((a) => a.type)).toContain("CONTACT_UPDATED");
  });

  it("creates a case for a contact and logs CASE_CREATED + CASE_ASSIGNED", async () => {
    const { user, org } = await createTestUserAndOrg("Case Owner");
    const contact = await createContact({ organizationId: org.id, actorUserId: user.id, name: "Case Contact" });

    const createdCase = await createCase({
      organizationId: org.id,
      actorUserId: user.id,
      contactId: contact.id,
      title: "Renew ID",
      assignedTo: user.id,
    });
    expect(createdCase.status).toBe("OPEN");

    const activities = await listActivitiesForEntity(org.id, "case", createdCase.id);
    expect(activities.map((a) => a.type)).toEqual(
      expect.arrayContaining(["CASE_CREATED", "CASE_ASSIGNED"]),
    );
  });

  it("changing a case's status logs CASE_STATUS_CHANGED and sets closedAt when resolved", async () => {
    const { user, org } = await createTestUserAndOrg("Case Closer");
    const contact = await createContact({ organizationId: org.id, actorUserId: user.id, name: "Contact" });
    const createdCase = await createCase({
      organizationId: org.id,
      actorUserId: user.id,
      contactId: contact.id,
      title: "Case",
    });

    const updated = await updateCase({
      organizationId: org.id,
      actorUserId: user.id,
      caseId: createdCase.id,
      title: "Case",
      status: "RESOLVED",
    });
    expect(updated?.status).toBe("RESOLVED");
    expect(updated?.closedAt).not.toBeNull();

    const activities = await listActivitiesForEntity(org.id, "case", createdCase.id);
    expect(activities.map((a) => a.type)).toContain("CASE_STATUS_CHANGED");
  });

  it("rejects creating a case for a contact from a different organization", async () => {
    const { user: userA, org: orgA } = await createTestUserAndOrg("Cross Org A");
    const { user: userB, org: orgB } = await createTestUserAndOrg("Cross Org B");
    const contactInB = await createContact({ organizationId: orgB.id, actorUserId: userB.id, name: "Foreign contact" });

    await expect(
      createCase({ organizationId: orgA.id, actorUserId: userA.id, contactId: contactInB.id, title: "Should fail" }),
    ).rejects.toThrow();
  });

  it("creates a task and completing it logs TASK_COMPLETED exactly once", async () => {
    const { user, org } = await createTestUserAndOrg("Task Owner");
    const task = await createTask({ organizationId: org.id, actorUserId: user.id, title: "Follow up" });
    expect(task.completedAt).toBeNull();

    const completedOnce = await updateTask({
      organizationId: org.id,
      actorUserId: user.id,
      taskId: task.id,
      title: task.title,
      completed: true,
    });
    expect(completedOnce?.completedAt).not.toBeNull();

    // Completing an already-completed task again must not log a second
    // TASK_COMPLETED — the activity feed should reflect "it happened", not
    // "how many times the checkbox was clicked".
    await updateTask({
      organizationId: org.id,
      actorUserId: user.id,
      taskId: task.id,
      title: task.title,
      completed: true,
    });

    const activities = await listActivitiesForEntity(org.id, "task", task.id);
    expect(activities.filter((a) => a.type === "TASK_COMPLETED")).toHaveLength(1);
  });

  describe("multi-tenant isolation (acceptance criterion 3 de PKG-002)", () => {
    it("an organization cannot read, list, or update another organization's contacts", async () => {
      const { user: userA, org: orgA } = await createTestUserAndOrg("Isolation Org A");
      const { user: userB, org: orgB } = await createTestUserAndOrg("Isolation Org B");

      const contactA = await createContact({ organizationId: orgA.id, actorUserId: userA.id, name: "Secret Contact" });

      const orgBContacts = await listContacts(orgB.id);
      expect(orgBContacts.find((c) => c.id === contactA.id)).toBeUndefined();

      const fetchedFromB = await getContact(orgB.id, contactA.id);
      expect(fetchedFromB).toBeNull();

      const updateAttempt = await updateContact({
        organizationId: orgB.id,
        actorUserId: userB.id,
        contactId: contactA.id,
        name: "Hijacked",
      });
      expect(updateAttempt).toBeNull();

      const stillOriginal = await getContact(orgA.id, contactA.id);
      expect(stillOriginal?.name).toBe("Secret Contact");
    });

    it("an organization cannot read or update another organization's cases", async () => {
      const { user: userA, org: orgA } = await createTestUserAndOrg("Isolation Cases A");
      const { user: userB, org: orgB } = await createTestUserAndOrg("Isolation Cases B");
      const contact = await createContact({ organizationId: orgA.id, actorUserId: userA.id, name: "Contact" });
      const caseA = await createCase({ organizationId: orgA.id, actorUserId: userA.id, contactId: contact.id, title: "Case A" });

      const fetchedFromB = await getCase(orgB.id, caseA.id);
      expect(fetchedFromB).toBeNull();

      const updateAttempt = await updateCase({
        organizationId: orgB.id,
        actorUserId: userB.id,
        caseId: caseA.id,
        title: "Hijacked",
        status: "CLOSED",
      });
      expect(updateAttempt).toBeNull();
    });

    it("cannot assign a case or task to a user outside the organization", async () => {
      const { user: userA, org: orgA } = await createTestUserAndOrg("Assign Org A");
      const { user: userB } = await createTestUserAndOrg("Assign Org B");
      const contact = await createContact({ organizationId: orgA.id, actorUserId: userA.id, name: "Contact" });

      await expect(
        createCase({
          organizationId: orgA.id,
          actorUserId: userA.id,
          contactId: contact.id,
          title: "Case",
          assignedTo: userB.id,
        }),
      ).rejects.toThrow();

      await expect(
        createTask({ organizationId: orgA.id, actorUserId: userA.id, title: "Task", assignedTo: userB.id }),
      ).rejects.toThrow();
    });
  });
});
