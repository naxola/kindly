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
import { contactAssignments } from "@/modules/contacts/schema";
import { conversations as conversationsTable, messages as messagesTable } from "@/modules/conversations/schema";
import {
  createContact,
  getContactForMember,
  listContactsForMember,
} from "@/modules/contacts/service";
import { assignContactToDelegate, getActiveAssignment, listAssignmentHistory } from "@/modules/contacts/assignments";
import { listCasesForMember } from "@/modules/cases/service";
import { createCase } from "@/modules/cases/service";
import { createTask } from "@/modules/tasks/service";
import { listTasksForMember } from "@/modules/tasks/service";
import { connectMessagingAccount } from "@/modules/messaging/service";
import { clearMessagingAdapters, registerMessagingAdapter } from "@/modules/messaging/registry";
import { receiveWebhook } from "@/modules/messaging/webhook-service";
import { listConversations } from "@/modules/conversations/service";
import { listActivitiesForEntity } from "@/modules/audit/service";
import { FakeMessagingAdapter } from "@/modules/messaging/testing/fake-adapter";

/**
 * Integration tests for PKG-014 (`docs/DECISIONS.md`: "Asignación de
 * afiliados" y "Delegado de referencia y acceso temporal") — against real
 * PostgreSQL.
 *
 * The Marta/Ana/Luis scenario needs one Contact reachable from *two*
 * different delegates' `MessagingAccount`s, which the real inbound
 * pipeline can never produce on its own (`findOrCreateConversation` always
 * creates a brand-new Contact per external chat — no fuzzy matching,
 * `docs/DECISIONS.md`). So those tests wire a second Conversation onto an
 * existing Contact by hand, the same way `inbox.test.ts`'s search test
 * bypasses the webhook pipeline for a case the real one cannot produce.
 */

let client: ReturnType<typeof postgres>;
let db: PostgresJsDatabase<typeof schema>;
const fakeAdapter = new FakeMessagingAdapter();

beforeAll(async () => {
  client = postgres(process.env.DATABASE_URL!, { max: 1 });
  db = drizzle(client, { schema });
  await migrate(db, {
    migrationsFolder: path.resolve(__dirname, "../../drizzle/migrations"),
  });
  registerMessagingAdapter(fakeAdapter);
});

afterAll(async () => {
  clearMessagingAdapters();
  await client.end();
});

async function createOrgWithMembers(name: string, roles: Array<"ADMIN" | "DELEGATE"> = ["ADMIN"]) {
  const [org] = await db.insert(organizations).values({ name: `${name}'s org` }).returning();
  const members = [];
  for (const [index, role] of roles.entries()) {
    const [user] = await db
      .insert(users)
      .values({ id: randomUUID(), name: `${name} ${index}`, email: `${randomUUID()}@example.com` })
      .returning();
    await db.insert(organizationMembers).values({ organizationId: org.id, userId: user.id, role });
    members.push(user);
  }
  return { org, members };
}

async function connectFakeAccount(organizationId: string, delegateId: string) {
  return connectMessagingAccount({ organizationId, actorUserId: delegateId, delegateId, channel: "fake" });
}

async function receiveInboundMessage(
  accountId: string,
  overrides: Partial<{ externalConversationId: string; externalMessageId: string; text: string }> = {},
) {
  const body = JSON.stringify({
    externalConversationId: overrides.externalConversationId ?? `chat-${randomUUID()}`,
    externalMessageId: overrides.externalMessageId ?? `msg-${randomUUID()}`,
    externalContactId: `provider-contact-${randomUUID()}`,
    text: overrides.text ?? "Hola",
  });
  const outcome = await receiveWebhook("fake", accountId, body, fakeAdapter.signatureHeaders());
  if (outcome.status !== 200) throw new Error("unreachable");
  await outcome.process();
  return outcome;
}

/** Wires a second Conversation for `contactId` onto `accountId`, with one message at `createdAt`. */
async function attachConversation(
  organizationId: string,
  contactId: string,
  accountId: string,
  channel: string,
  direction: "INBOUND" | "OUTBOUND",
  createdAt: Date,
) {
  const [conversation] = await db
    .insert(conversationsTable)
    .values({
      organizationId,
      messagingAccountId: accountId,
      contactId,
      channel,
      externalConversationId: `chat-${randomUUID()}`,
    })
    .returning();
  await db.insert(messagesTable).values({
    organizationId,
    conversationId: conversation.id,
    messagingAccountId: accountId,
    externalMessageId: `msg-${randomUUID()}`,
    direction,
    body: "hola",
    deliveryStatus: direction === "INBOUND" ? "DELIVERED" : "SENT",
    createdAt,
    updatedAt: createdAt,
  });
  return conversation;
}

async function addMessage(
  organizationId: string,
  conversationId: string,
  accountId: string,
  direction: "INBOUND" | "OUTBOUND",
  createdAt: Date,
) {
  await db.insert(messagesTable).values({
    organizationId,
    conversationId,
    messagingAccountId: accountId,
    externalMessageId: `msg-${randomUUID()}`,
    direction,
    body: "hola de nuevo",
    deliveryStatus: direction === "INBOUND" ? "DELIVERED" : "SENT",
    createdAt,
    updatedAt: createdAt,
  });
}

describe("PKG-014 contact assignment (integration, real PostgreSQL)", () => {
  describe("initial assignment", () => {
    it("createContact assigns the creator as the reference delegate", async () => {
      const { org, members } = await createOrgWithMembers("Manual Create Org");
      const [admin] = members;

      const contact = await createContact({ organizationId: org.id, actorUserId: admin.id, name: "Ada Lovelace" });

      const active = await getActiveAssignment(org.id, contact.id);
      expect(active?.delegateId).toBe(admin.id);
      expect(active?.assignedBy).toBeNull();
    });

    it("an inbound message assigns the receiving MessagingAccount's own delegate", async () => {
      const { org, members } = await createOrgWithMembers("Inbound Create Org");
      const [admin] = members;
      const account = await connectFakeAccount(org.id, admin.id);

      await receiveInboundMessage(account.id);

      const [conversation] = await listConversations(org.id);
      const active = await getActiveAssignment(org.id, conversation.contactId);
      expect(active?.delegateId).toBe(admin.id);
      expect(active?.assignedBy).toBeNull();
    });
  });

  describe("assignContactToDelegate", () => {
    it("closes the previous assignment and records CONTACT_DELEGATE_ASSIGNED", async () => {
      const { org, members } = await createOrgWithMembers("Reassign Org", ["ADMIN", "DELEGATE", "DELEGATE"]);
      const [admin, delegateA, delegateB] = members;
      const contact = await createContact({ organizationId: org.id, actorUserId: delegateA.id, name: "Marta" });

      const updated = await assignContactToDelegate(org.id, admin.id, contact.id, delegateB.id);
      expect(updated.delegateId).toBe(delegateB.id);

      const active = await getActiveAssignment(org.id, contact.id);
      expect(active?.delegateId).toBe(delegateB.id);

      const history = await listAssignmentHistory(org.id, contact.id);
      expect(history).toHaveLength(2);
      expect(history[0].delegateId).toBe(delegateB.id);
      expect(history[0].endedAt).toBeNull();
      expect(history[1].delegateId).toBe(delegateA.id);
      expect(history[1].endedAt).not.toBeNull();

      const activities = await listActivitiesForEntity(org.id, "contact", contact.id);
      const reassignment = activities.find((a) => a.type === "CONTACT_DELEGATE_ASSIGNED");
      expect(reassignment?.metadata).toMatchObject({ from: delegateA.id, to: delegateB.id });
    });

    it("is a no-op when reassigning to the already-active delegate", async () => {
      const { org, members } = await createOrgWithMembers("Reassign Noop Org", ["ADMIN", "DELEGATE"]);
      const [admin, delegate] = members;
      const contact = await createContact({ organizationId: org.id, actorUserId: delegate.id, name: "Marta" });
      const before = await getActiveAssignment(org.id, contact.id);

      const result = await assignContactToDelegate(org.id, admin.id, contact.id, delegate.id);
      expect(result.startedAt).toEqual(before!.startedAt);

      const history = await listAssignmentHistory(org.id, contact.id);
      expect(history).toHaveLength(1);

      const activities = await listActivitiesForEntity(org.id, "contact", contact.id);
      expect(activities.filter((a) => a.type === "CONTACT_DELEGATE_ASSIGNED")).toHaveLength(0);
    });

    it("refuses to assign to someone outside the organization", async () => {
      const { org, members } = await createOrgWithMembers("Reassign Guard Org", ["ADMIN"]);
      const [admin] = members;
      const { members: otherOrgMembers } = await createOrgWithMembers("Outsider Org", ["ADMIN"]);
      const contact = await createContact({ organizationId: org.id, actorUserId: admin.id, name: "Marta" });

      await expect(
        assignContactToDelegate(org.id, admin.id, contact.id, otherOrgMembers[0].id),
      ).rejects.toThrow(/outside the organization/);
    });
  });

  describe("visibility — docs/DECISIONS.md \"Delegado de referencia y acceso temporal\"", () => {
    it("an ADMIN sees every Contact regardless of assignment", async () => {
      const { org, members } = await createOrgWithMembers("Admin Sees All Org", ["ADMIN", "DELEGATE"]);
      const [admin, delegate] = members;
      const contact = await createContact({ organizationId: org.id, actorUserId: delegate.id, name: "Marta" });

      const admins = { userId: admin.id, role: "ADMIN" as const };
      expect(await getContactForMember(org.id, admins, contact.id)).not.toBeNull();
      expect((await listContactsForMember(org.id, admins)).map((c) => c.id)).toContain(contact.id);
    });

    it("the reference delegate sees the Contact even with no messages exchanged", async () => {
      const { org, members } = await createOrgWithMembers("Reference Sees Org", ["DELEGATE"]);
      const [delegate] = members;
      const contact = await createContact({ organizationId: org.id, actorUserId: delegate.id, name: "Marta" });

      const asDelegate = { userId: delegate.id, role: "DELEGATE" as const };
      expect(await getContactForMember(org.id, asDelegate, contact.id)).not.toBeNull();
    });

    it("a delegate who is neither the reference nor ever messaged sees nothing", async () => {
      const { org, members } = await createOrgWithMembers("No Access Org", ["DELEGATE", "DELEGATE"]);
      const [reference, stranger] = members;
      const contact = await createContact({ organizationId: org.id, actorUserId: reference.id, name: "Marta" });

      const asStranger = { userId: stranger.id, role: "DELEGATE" as const };
      expect(await getContactForMember(org.id, asStranger, contact.id)).toBeNull();
      expect((await listContactsForMember(org.id, asStranger)).map((c) => c.id)).not.toContain(contact.id);
    });

    it("acceso temporal: a non-reference delegate the Contact just wrote to can see it, until the reference delegate exchanges a message", async () => {
      const { org, members } = await createOrgWithMembers("Temporary Access Org", ["DELEGATE", "DELEGATE"]);
      const [luis, ana] = members;
      const luisAccount = await connectFakeAccount(org.id, luis.id);
      const anaAccount = await connectFakeAccount(org.id, ana.id);

      // Marta is Luis's afiliada (reference delegate), assigned via her
      // first message to him.
      await receiveInboundMessage(luisAccount.id, { text: "Hola Luis" });
      const [luisConversation] = await listConversations(org.id);
      const contactId = luisConversation.contactId;
      expect((await getActiveAssignment(org.id, contactId))?.delegateId).toBe(luis.id);

      const asAna = { userId: ana.id, role: "DELEGATE" as const };
      expect(await getContactForMember(org.id, asAna, contactId)).toBeNull();

      // Marta also writes to Ana, who is not her reference delegate.
      const anaConversation = await attachConversation(
        org.id,
        contactId,
        anaAccount.id,
        "fake",
        "INBOUND",
        new Date(),
      );
      expect(await getContactForMember(org.id, asAna, contactId)).not.toBeNull();

      // Luis and Marta exchange a message after that — Ana's temporary
      // access ends, per the correction in docs/DECISIONS.md ("si Luis
      // escribe a Marta, Ana también deja de verla").
      await addMessage(org.id, luisConversation.id, luisAccount.id, "OUTBOUND", new Date(Date.now() + 1000));
      expect(await getContactForMember(org.id, asAna, contactId)).toBeNull();

      // If Marta writes to Ana again after that, access opens back up.
      await addMessage(org.id, anaConversation.id, anaAccount.id, "INBOUND", new Date(Date.now() + 2000));
      expect(await getContactForMember(org.id, asAna, contactId)).not.toBeNull();

      // Luis, the reference delegate, sees it throughout regardless.
      const asLuis = { userId: luis.id, role: "DELEGATE" as const };
      expect(await getContactForMember(org.id, asLuis, contactId)).not.toBeNull();
    });
  });

  describe("Cases and Tasks inherit Contact visibility", () => {
    it("a Case is visible exactly when its Contact is", async () => {
      const { org, members } = await createOrgWithMembers("Case Visibility Org", ["DELEGATE", "DELEGATE"]);
      const [reference, stranger] = members;
      const contact = await createContact({ organizationId: org.id, actorUserId: reference.id, name: "Marta" });
      await createCase({ organizationId: org.id, actorUserId: reference.id, contactId: contact.id, title: "Baja médica" });

      const asReference = { userId: reference.id, role: "DELEGATE" as const };
      const asStranger = { userId: stranger.id, role: "DELEGATE" as const };
      expect(await listCasesForMember(org.id, asReference)).toHaveLength(1);
      expect(await listCasesForMember(org.id, asStranger)).toHaveLength(0);
    });

    it("a contactless Task is visible to everyone; one linked to a Contact follows its visibility", async () => {
      const { org, members } = await createOrgWithMembers("Task Visibility Org", ["DELEGATE", "DELEGATE"]);
      const [reference, stranger] = members;
      const contact = await createContact({ organizationId: org.id, actorUserId: reference.id, name: "Marta" });
      await createTask({ organizationId: org.id, actorUserId: reference.id, title: "General task" });
      await createTask({
        organizationId: org.id,
        actorUserId: reference.id,
        title: "Follow up with Marta",
        contactId: contact.id,
      });

      const asReference = { userId: reference.id, role: "DELEGATE" as const };
      const asStranger = { userId: stranger.id, role: "DELEGATE" as const };
      expect(await listTasksForMember(org.id, asReference)).toHaveLength(2);
      expect((await listTasksForMember(org.id, asStranger)).map((t) => t.title)).toEqual(["General task"]);
    });
  });

  describe("multi-tenant isolation", () => {
    it("an assignment never crosses organizations", async () => {
      const { org: orgA, members: membersA } = await createOrgWithMembers("Isolation Assign A", ["ADMIN"]);
      const { org: orgB } = await createOrgWithMembers("Isolation Assign B", ["ADMIN"]);
      const contact = await createContact({ organizationId: orgA.id, actorUserId: membersA[0].id, name: "Marta" });

      expect(await getActiveAssignment(orgB.id, contact.id)).toBeNull();

      const [row] = await db.select().from(contactAssignments).where(eq(contactAssignments.contactId, contact.id));
      expect(row.organizationId).toBe(orgA.id);
    });
  });
});
