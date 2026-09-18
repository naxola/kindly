import { describe, expect, it } from "vitest";
import { getTableColumns } from "drizzle-orm";
import { messagingAccounts, messagingAccountStatus } from "@/modules/messaging/schema";
import { conversations, conversationCases, messageDeliveryStatus, messageDirection, messages } from "@/modules/conversations/schema";
import { tasks } from "@/modules/tasks/schema";

describe("messaging schema (unit, no database)", () => {
  it("only allows the seven documented MessagingAccount statuses", () => {
    // docs/DATABASE.md sección 5.
    expect(messagingAccountStatus.enumValues).toEqual([
      "PENDING",
      "CONNECTING",
      "CONNECTED",
      "DEGRADED",
      "DISCONNECTED",
      "REVOKED",
      "ERROR",
    ]);
  });

  it("has the columns documented for MessagingAccount, with channel as free text", () => {
    const columns = Object.keys(getTableColumns(messagingAccounts));
    expect(columns).toEqual(
      expect.arrayContaining([
        "id",
        "organizationId",
        "delegateId",
        "channel",
        "phoneE164",
        "externalAccountId",
        "externalBusinessAccountId",
        "externalConnectionId",
        "displayName",
        "status",
        "metadata",
        "credentialsReference",
        "connectedAt",
        "disconnectedAt",
        "lastSyncAt",
        "lastError",
      ]),
    );
  });

  it("only allows INBOUND/OUTBOUND directions and the five documented delivery statuses", () => {
    expect(messageDirection.enumValues).toEqual(["INBOUND", "OUTBOUND"]);
    expect(messageDeliveryStatus.enumValues).toEqual(["PENDING", "SENT", "DELIVERED", "READ", "FAILED"]);
  });

  it("has the columns documented for Conversation", () => {
    const columns = Object.keys(getTableColumns(conversations));
    expect(columns).toEqual(
      expect.arrayContaining([
        "id",
        "organizationId",
        "messagingAccountId",
        "contactId",
        "channel",
        "externalConversationId",
      ]),
    );
  });

  it("has the columns documented for Message, plus body and sourceWebhookEventId", () => {
    const columns = Object.keys(getTableColumns(messages));
    expect(columns).toEqual(
      expect.arrayContaining([
        "id",
        "organizationId",
        "conversationId",
        "messagingAccountId",
        "externalMessageId",
        "externalChatId",
        "direction",
        "body",
        "deliveryStatus",
        "sourceWebhookEventId",
        "editedAt",
        "deletedAt",
      ]),
    );
  });

  it("has a composite primary key on conversation_cases", () => {
    const columns = Object.keys(getTableColumns(conversationCases));
    expect(columns).toEqual(expect.arrayContaining(["conversationId", "caseId", "createdAt"]));
  });

  it("adds conversationId to tasks", () => {
    const columns = Object.keys(getTableColumns(tasks));
    expect(columns).toContain("conversationId");
  });
});
