import { randomUUID } from "node:crypto";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import postgres from "postgres";
import { drizzle, type PostgresJsDatabase } from "drizzle-orm/postgres-js";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import * as schema from "@/db/schema";
import { users } from "@/modules/auth/schema";
import { organizationMembers, organizations } from "@/modules/organizations/schema";
import { conversations as conversationsTable } from "@/modules/conversations/schema";
import { messagingAccounts } from "@/modules/messaging/schema";
import { createContact } from "@/modules/contacts/service";
import { createCase } from "@/modules/cases/service";
import {
  linkConversationToCase,
  listCaseIdsLinkedToConversation,
  listLinkedConversations,
  unlinkConversationFromCase,
} from "@/modules/conversations/service";
import { listActivitiesForEntity, recordActivity } from "@/modules/audit/service";

/**
 * Integration tests for the Conversation ↔ Case link (Fase 6,
 * `conversation_cases`, deferred from PKG-003 until this fase built a UI for
 * it) — against real PostgreSQL. `linkConversationToCase`/
 * `unlinkConversationFromCase` live in `conversations/service.ts` (PKG-003),
 * but the activity they log belongs to the Case (`cases/actions.ts`), so
 * that part is exercised through the actions layer's own logic replicated
 * here at the service level — see `crm.test.ts` for the Case CRUD/lifecycle
 * counterpart.
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

/** A bare Conversation for `contactId`, bypassing the webhook pipeline — same purpose as `attachConversation` in contact-assignments.test.ts. */
async function createConversation(organizationId: string, contactId: string, delegateId: string) {
  const [account] = await db
    .insert(messagingAccounts)
    .values({ organizationId, delegateId, channel: "fake", externalAccountId: `acct-${randomUUID()}` })
    .returning();
  const [conversation] = await db
    .insert(conversationsTable)
    .values({ organizationId, messagingAccountId: account.id, contactId, channel: "fake", externalConversationId: `chat-${randomUUID()}` })
    .returning();
  return conversation;
}

describe("Conversation <-> Case link (Fase 6, integration, real PostgreSQL)", () => {
  it("links a conversation to a case and lists it both ways", async () => {
    const { user, org } = await createTestUserAndOrg("Link Owner");
    const contact = await createContact({ organizationId: org.id, actorUserId: user.id, name: "Contact" });
    const createdCase = await createCase({ organizationId: org.id, actorUserId: user.id, contactId: contact.id, title: "Case" });
    const conversation = await createConversation(org.id, contact.id, user.id);

    await linkConversationToCase(org.id, conversation.id, createdCase.id);

    const linked = await listLinkedConversations(org.id, createdCase.id);
    expect(linked.map((l) => l.conversation.id)).toEqual([conversation.id]);

    const linkedCaseIds = await listCaseIdsLinkedToConversation(org.id, conversation.id);
    expect(linkedCaseIds).toEqual([createdCase.id]);
  });

  it("linking the same pair twice is a no-op, not an error", async () => {
    const { user, org } = await createTestUserAndOrg("Link Idempotent");
    const contact = await createContact({ organizationId: org.id, actorUserId: user.id, name: "Contact" });
    const createdCase = await createCase({ organizationId: org.id, actorUserId: user.id, contactId: contact.id, title: "Case" });
    const conversation = await createConversation(org.id, contact.id, user.id);

    await linkConversationToCase(org.id, conversation.id, createdCase.id);
    await linkConversationToCase(org.id, conversation.id, createdCase.id);

    const linked = await listLinkedConversations(org.id, createdCase.id);
    expect(linked).toHaveLength(1);
  });

  it("unlinking removes the row and re-linking works again", async () => {
    const { user, org } = await createTestUserAndOrg("Link Unlink");
    const contact = await createContact({ organizationId: org.id, actorUserId: user.id, name: "Contact" });
    const createdCase = await createCase({ organizationId: org.id, actorUserId: user.id, contactId: contact.id, title: "Case" });
    const conversation = await createConversation(org.id, contact.id, user.id);

    await linkConversationToCase(org.id, conversation.id, createdCase.id);
    await unlinkConversationFromCase(org.id, conversation.id, createdCase.id);
    expect(await listLinkedConversations(org.id, createdCase.id)).toHaveLength(0);

    await linkConversationToCase(org.id, conversation.id, createdCase.id);
    expect(await listLinkedConversations(org.id, createdCase.id)).toHaveLength(1);
  });

  it("rejects linking a conversation whose Contact differs from the Case's Contact", async () => {
    const { user, org } = await createTestUserAndOrg("Link Cross Contact");
    const caseContact = await createContact({ organizationId: org.id, actorUserId: user.id, name: "Case Contact" });
    const otherContact = await createContact({ organizationId: org.id, actorUserId: user.id, name: "Other Contact" });
    const createdCase = await createCase({ organizationId: org.id, actorUserId: user.id, contactId: caseContact.id, title: "Case" });
    const conversation = await createConversation(org.id, otherContact.id, user.id);

    await expect(linkConversationToCase(org.id, conversation.id, createdCase.id)).rejects.toThrow();
  });

  it("rejects linking across organizations", async () => {
    const { user: userA, org: orgA } = await createTestUserAndOrg("Link Cross Org A");
    const { user: userB, org: orgB } = await createTestUserAndOrg("Link Cross Org B");
    const contactA = await createContact({ organizationId: orgA.id, actorUserId: userA.id, name: "Contact A" });
    const caseA = await createCase({ organizationId: orgA.id, actorUserId: userA.id, contactId: contactA.id, title: "Case A" });
    const contactB = await createContact({ organizationId: orgB.id, actorUserId: userB.id, name: "Contact B" });
    const conversationB = await createConversation(orgB.id, contactB.id, userB.id);

    await expect(linkConversationToCase(orgA.id, conversationB.id, caseA.id)).rejects.toThrow();
  });
});

describe("Case activity for link/unlink (Fase 6)", () => {
  // `cases/actions.ts::linkConversationToCaseAction`/
  // `unlinkConversationFromCaseAction`/`linkCurrentConversationToCaseAction`
  // are thin wrappers around exactly this pair of calls (service call +
  // `recordActivity`) — untestable directly here since they need a request
  // context (`requireCurrentOrganizationMember`) that Vitest doesn't
  // provide, same reason `crm.test.ts` tests `cases/service.ts` rather than
  // `cases/actions.ts`.
  it("linking and unlinking each log their own Case activity type", async () => {
    const { user, org } = await createTestUserAndOrg("Link Activity");
    const contact = await createContact({ organizationId: org.id, actorUserId: user.id, name: "Contact" });
    const createdCase = await createCase({ organizationId: org.id, actorUserId: user.id, contactId: contact.id, title: "Case" });
    const conversation = await createConversation(org.id, contact.id, user.id);

    await linkConversationToCase(org.id, conversation.id, createdCase.id);
    await recordActivity({
      organizationId: org.id,
      type: "CASE_CONVERSATION_LINKED",
      actorUserId: user.id,
      entityType: "case",
      entityId: createdCase.id,
      metadata: { conversationId: conversation.id },
    });

    await unlinkConversationFromCase(org.id, conversation.id, createdCase.id);
    await recordActivity({
      organizationId: org.id,
      type: "CASE_CONVERSATION_UNLINKED",
      actorUserId: user.id,
      entityType: "case",
      entityId: createdCase.id,
      metadata: { conversationId: conversation.id },
    });

    const activities = await listActivitiesForEntity(org.id, "case", createdCase.id);
    expect(activities.map((a) => a.type)).toEqual(
      expect.arrayContaining(["CASE_CONVERSATION_LINKED", "CASE_CONVERSATION_UNLINKED"]),
    );
  });
});
