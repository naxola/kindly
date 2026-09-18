/**
 * Drizzle schema for `conversations`, `messages` and `conversation_cases`.
 * Scope: PKG-003 — Messaging core (backend, sin UI de Inbox).
 *
 * Deferred from PKG-002 because they depend on `messaging_accounts`
 * (docs/DECISIONS.md, entrada PKG-002 nº1).
 *
 * `messages.body` and `messages.sourceWebhookEventId` are not in the
 * pseudocode of docs/DATABASE.md sección 8 — added because a Message
 * without content is useless, and outbound messages have no webhook to
 * reference at all. See docs/DECISIONS.md.
 */
import { relations } from "drizzle-orm";
import { pgEnum, pgTable, primaryKey, text, timestamp, unique, uuid } from "drizzle-orm/pg-core";
import { organizations } from "@/modules/organizations/schema";
import { contacts } from "@/modules/contacts/schema";
import { cases } from "@/modules/cases/schema";
import { messagingAccounts, webhookEvents } from "@/modules/messaging/schema";

export const conversations = pgTable(
  "conversations",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    messagingAccountId: uuid("messaging_account_id")
      .notNull()
      .references(() => messagingAccounts.id, { onDelete: "cascade" }),
    contactId: uuid("contact_id")
      .notNull()
      .references(() => contacts.id, { onDelete: "cascade" }),
    channel: text("channel").notNull(),
    externalConversationId: text("external_conversation_id").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [unique().on(table.messagingAccountId, table.externalConversationId)],
);

export const conversationsRelations = relations(conversations, ({ one, many }) => ({
  organization: one(organizations, {
    fields: [conversations.organizationId],
    references: [organizations.id],
  }),
  messagingAccount: one(messagingAccounts, {
    fields: [conversations.messagingAccountId],
    references: [messagingAccounts.id],
  }),
  contact: one(contacts, {
    fields: [conversations.contactId],
    references: [contacts.id],
  }),
  messages: many(messages),
}));

export const messageDirection = pgEnum("message_direction", ["INBOUND", "OUTBOUND"]);
export type MessageDirection = (typeof messageDirection.enumValues)[number];

export const messageDeliveryStatus = pgEnum("message_delivery_status", [
  "PENDING",
  "SENT",
  "DELIVERED",
  "READ",
  "FAILED",
]);
export type MessageDeliveryStatus = (typeof messageDeliveryStatus.enumValues)[number];

export const messages = pgTable(
  "messages",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    conversationId: uuid("conversation_id")
      .notNull()
      .references(() => conversations.id, { onDelete: "cascade" }),
    messagingAccountId: uuid("messaging_account_id")
      .notNull()
      .references(() => messagingAccounts.id, { onDelete: "cascade" }),
    externalMessageId: text("external_message_id").notNull(),
    externalChatId: text("external_chat_id"),
    direction: messageDirection("direction").notNull(),
    body: text("body").notNull(),
    deliveryStatus: messageDeliveryStatus("delivery_status").notNull().default("PENDING"),
    // Nullable: only inbound messages come from a webhook. Outbound messages
    // (created by sendOutboundMessage) have nothing to reference here.
    sourceWebhookEventId: uuid("source_webhook_event_id").references(() => webhookEvents.id, {
      onDelete: "set null",
    }),
    editedAt: timestamp("edited_at", { withTimezone: true }),
    deletedAt: timestamp("deleted_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [unique().on(table.messagingAccountId, table.externalMessageId)],
);

export const messagesRelations = relations(messages, ({ one }) => ({
  organization: one(organizations, {
    fields: [messages.organizationId],
    references: [organizations.id],
  }),
  conversation: one(conversations, {
    fields: [messages.conversationId],
    references: [conversations.id],
  }),
  messagingAccount: one(messagingAccounts, {
    fields: [messages.messagingAccountId],
    references: [messagingAccounts.id],
  }),
}));

export const conversationCases = pgTable(
  "conversation_cases",
  {
    conversationId: uuid("conversation_id")
      .notNull()
      .references(() => conversations.id, { onDelete: "cascade" }),
    caseId: uuid("case_id")
      .notNull()
      .references(() => cases.id, { onDelete: "cascade" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [primaryKey({ columns: [table.conversationId, table.caseId] })],
);

export const conversationCasesRelations = relations(conversationCases, ({ one }) => ({
  conversation: one(conversations, {
    fields: [conversationCases.conversationId],
    references: [conversations.id],
  }),
  case: one(cases, {
    fields: [conversationCases.caseId],
    references: [cases.id],
  }),
}));
