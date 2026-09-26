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
import { contacts } from "@/modules/contacts/schema";
import { createContact, markContactIdentified } from "@/modules/contacts/service";
import { connectMessagingAccount } from "@/modules/messaging/service";
import { clearMessagingAdapters, registerMessagingAdapter } from "@/modules/messaging/registry";
import { receiveWebhook } from "@/modules/messaging/webhook-service";
import {
  countUnreadConversations,
  getConversation,
  getConversationWithDetails,
  listConversationsWithPreview,
  listConversations,
  markConversationRead,
  reassignConversationContact,
} from "@/modules/conversations/service";
import { listActivitiesForEntity } from "@/modules/audit/service";
import { FakeMessagingAdapter } from "@/modules/messaging/testing/fake-adapter";

/**
 * Integration tests for PKG-004 (Unified Inbox): the Contact
 * `isUnassigned`/"identify"/"reassign" flow, Inbox listing filters/unread,
 * and multi-tenant isolation — against real PostgreSQL. Reuses the
 * FakeMessagingAdapter pipeline exactly like tests/integration/messaging.test.ts
 * to get a Conversation/Message onto the board without a real provider.
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

async function createTestUserAndOrg(name: string) {
  const [user] = await db
    .insert(users)
    .values({ id: randomUUID(), name, email: `${randomUUID()}@example.com` })
    .returning();
  const [org] = await db.insert(organizations).values({ name: `${name}'s org` }).returning();
  await db.insert(organizationMembers).values({ organizationId: org.id, userId: user.id, role: "ADMIN" });
  return { user, org };
}

async function connectFakeAccount(organizationId: string, delegateId: string) {
  return connectMessagingAccount({
    organizationId,
    actorUserId: delegateId,
    delegateId,
    channel: "fake",
  });
}

async function receiveInboundMessage(
  accountId: string,
  overrides: Partial<{ externalConversationId: string; externalMessageId: string; text: string; contactDisplayName: string | null }> = {},
) {
  const body = JSON.stringify({
    externalConversationId: overrides.externalConversationId ?? `chat-${randomUUID()}`,
    externalMessageId: overrides.externalMessageId ?? `msg-${randomUUID()}`,
    externalContactId: `provider-contact-${randomUUID()}`,
    contactDisplayName: overrides.contactDisplayName ?? null,
    text: overrides.text ?? "Hola",
  });
  const outcome = await receiveWebhook("fake", accountId, body, fakeAdapter.signatureHeaders());
  if (outcome.status !== 200) throw new Error("unreachable");
  await outcome.process();
  return outcome;
}

describe("PKG-004 Unified Inbox (integration, real PostgreSQL)", () => {
  it("marks the auto-created Contact as isUnassigned, unlike a manually created one", async () => {
    const { user, org } = await createTestUserAndOrg("Auto Contact Org");
    const account = await connectFakeAccount(org.id, user.id);

    await receiveInboundMessage(account.id, { contactDisplayName: "Ada Lovelace" });

    const conversations = await listConversations(org.id);
    const [autoContact] = await db.select().from(contacts).where(eq(contacts.id, conversations[0].contactId));
    expect(autoContact.isUnassigned).toBe(true);

    const manualContact = await createContact({
      organizationId: org.id,
      actorUserId: user.id,
      name: "Manual Contact",
    });
    expect(manualContact.isUnassigned).toBe(false);
  });

  it("markContactIdentified clears isUnassigned and records CONTACT_IDENTIFIED", async () => {
    const { user, org } = await createTestUserAndOrg("Identify Org");
    const account = await connectFakeAccount(org.id, user.id);
    await receiveInboundMessage(account.id);

    const conversations = await listConversations(org.id);
    const contactId = conversations[0].contactId;

    const updated = await markContactIdentified(org.id, user.id, contactId);
    expect(updated?.isUnassigned).toBe(false);

    const activities = await listActivitiesForEntity(org.id, "contact", contactId);
    expect(activities.map((a) => a.type)).toContain("CONTACT_IDENTIFIED");
  });

  it("reassignConversationContact moves the conversation to an existing contact and records CONVERSATION_REASSIGNED", async () => {
    const { user, org } = await createTestUserAndOrg("Reassign Org");
    const account = await connectFakeAccount(org.id, user.id);
    await receiveInboundMessage(account.id);

    const [conversation] = await listConversations(org.id);
    const originalContactId = conversation.contactId;
    const targetContact = await createContact({ organizationId: org.id, actorUserId: user.id, name: "Real Contact" });

    const updated = await reassignConversationContact(org.id, user.id, conversation.id, targetContact.id);
    expect(updated?.contactId).toBe(targetContact.id);

    const activities = await listActivitiesForEntity(org.id, "conversation", conversation.id);
    const reassignment = activities.find((a) => a.type === "CONVERSATION_REASSIGNED");
    expect(reassignment?.metadata).toMatchObject({ from: originalContactId, to: targetContact.id });
  });

  it("rejects reassigning to a contact from a different organization", async () => {
    const { user, org } = await createTestUserAndOrg("Reassign Guard Org");
    const { org: otherOrg } = await createTestUserAndOrg("Reassign Guard Other Org");
    const account = await connectFakeAccount(org.id, user.id);
    await receiveInboundMessage(account.id);
    const [conversation] = await listConversations(org.id);

    const foreignContact = await createContact({ organizationId: otherOrg.id, actorUserId: user.id, name: "Foreign" });

    await expect(reassignConversationContact(org.id, user.id, conversation.id, foreignContact.id)).rejects.toThrow();
  });

  describe("listConversationsWithPreview", () => {
    it("filters by channel and unreadOnly, and orders by the latest message", async () => {
      const { user, org } = await createTestUserAndOrg("Listing Org");
      const account = await connectFakeAccount(org.id, user.id);

      await receiveInboundMessage(account.id, { text: "Primero" });
      await new Promise((resolve) => setTimeout(resolve, 5));
      const secondConversationId = `chat-${randomUUID()}`;
      await receiveInboundMessage(account.id, { externalConversationId: secondConversationId, text: "Segundo, más reciente" });

      const all = await listConversationsWithPreview(org.id, {});
      expect(all).toHaveLength(2);
      expect(all[0].lastMessage?.body).toBe("Segundo, más reciente");
      expect(all.every((c) => c.unread)).toBe(true);

      const filteredByChannel = await listConversationsWithPreview(org.id, { channel: "fake" });
      expect(filteredByChannel).toHaveLength(2);
      const filteredByOtherChannel = await listConversationsWithPreview(org.id, { channel: "other" });
      expect(filteredByOtherChannel).toHaveLength(0);

      const conversationToMarkRead = all.find((c) => c.lastMessage?.body === "Primero")!;
      await markConversationRead(org.id, conversationToMarkRead.id);

      const unreadOnly = await listConversationsWithPreview(org.id, { unreadOnly: true });
      expect(unreadOnly.map((c) => c.id)).not.toContain(conversationToMarkRead.id);
      expect(unreadOnly).toHaveLength(1);
    });
  });

  describe("countUnreadConversations", () => {
    it("counts conversations, not messages, and updates once one is marked read", async () => {
      const { user, org } = await createTestUserAndOrg("Unread Count Org");
      const account = await connectFakeAccount(org.id, user.id);

      const conversationId = `chat-${randomUUID()}`;
      await receiveInboundMessage(account.id, { externalConversationId: conversationId, text: "Uno" });
      // A second message in the same Conversation must not double-count it.
      await receiveInboundMessage(account.id, { externalConversationId: conversationId, text: "Dos" });
      await receiveInboundMessage(account.id, { text: "Otra conversación" });

      expect(await countUnreadConversations(org.id)).toBe(2);

      const [firstConversation] = await listConversations(org.id);
      await markConversationRead(org.id, firstConversation.id);
      expect(await countUnreadConversations(org.id)).toBe(1);
    });

    it("is organization-wide, not per delegate (Inbox is shared, unlike Channels)", async () => {
      const { user: admin, org } = await createTestUserAndOrg("Shared Inbox Org");
      const otherDelegate = await db
        .insert(users)
        .values({ id: randomUUID(), name: "Other Delegate", email: `${randomUUID()}@example.com` })
        .returning();
      await db
        .insert(organizationMembers)
        .values({ organizationId: org.id, userId: otherDelegate[0].id, role: "DELEGATE" });
      const account = await connectFakeAccount(org.id, otherDelegate[0].id);
      await receiveInboundMessage(account.id);

      // The count seen by the ADMIN (who did not connect this account)
      // includes conversations on every delegate's channel.
      expect(await countUnreadConversations(org.id)).toBe(1);
      void admin;
    });

    it("returns 0 for an organization with no conversations", async () => {
      const { org } = await createTestUserAndOrg("Empty Unread Org");
      expect(await countUnreadConversations(org.id)).toBe(0);
    });
  });

  describe("multi-tenant isolation", () => {
    it("an organization cannot list, read, mark-read, or reassign another organization's Conversation", async () => {
      const { user: userA, org: orgA } = await createTestUserAndOrg("Isolation Inbox A");
      const { user: userB, org: orgB } = await createTestUserAndOrg("Isolation Inbox B");

      const accountA = await connectFakeAccount(orgA.id, userA.id);
      await receiveInboundMessage(accountA.id);
      const [conversationA] = await listConversations(orgA.id);

      expect(await listConversationsWithPreview(orgB.id, {})).toHaveLength(0);
      expect(await countUnreadConversations(orgB.id)).toBe(0);
      expect(await getConversationWithDetails(orgB.id, conversationA.id)).toBeNull();
      expect(await getConversation(orgB.id, conversationA.id)).toBeNull();

      // markConversationRead silently no-ops outside the organization (same
      // "wrong organizationId matches zero rows" pattern as every other
      // service in this codebase) — verified by confirming org A's own
      // unread state is untouched.
      await markConversationRead(orgB.id, conversationA.id);
      const stillUnread = await listConversationsWithPreview(orgA.id, {});
      expect(stillUnread[0].unread).toBe(true);

      const otherOrgContact = await createContact({ organizationId: orgB.id, actorUserId: userB.id, name: "Org B Contact" });
      await expect(
        reassignConversationContact(orgB.id, userB.id, conversationA.id, otherOrgContact.id),
      ).rejects.toThrow();
    });
  });
});
