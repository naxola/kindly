/**
 * Drizzle schema for `messaging_accounts` and `webhook_events`.
 * Scope: PKG-003 — Messaging core (backend, sin UI de Inbox).
 *
 * `channel` is free text, not a Postgres enum, for the same reason as
 * `Activity.type` (docs/DECISIONS.md): the set of channels keeps growing
 * (Telegram, WhatsApp, email, SMS...) and it's validated at the application
 * layer against the adapter registry (src/modules/messaging/registry.ts),
 * not at the database level.
 *
 * `webhook_events.raw_body`/`headers` store the payload inline instead of a
 * `raw_event_reference` pointing at external object storage
 * (docs/DATABASE.md sección 17 mentions a reference) — introducing S3 for
 * this has no concrete need yet given the expected payload size (text
 * messages), see docs/DECISIONS.md.
 */
import { relations } from "drizzle-orm";
import { jsonb, pgEnum, pgTable, text, timestamp, unique, uuid } from "drizzle-orm/pg-core";
import { organizations } from "@/modules/organizations/schema";
import { users } from "@/modules/auth/schema";

export const messagingAccountStatus = pgEnum("messaging_account_status", [
  "PENDING",
  "CONNECTING",
  "CONNECTED",
  "DEGRADED",
  "DISCONNECTED",
  "REVOKED",
  "ERROR",
]);
export type MessagingAccountStatus = (typeof messagingAccountStatus.enumValues)[number];

export const messagingAccounts = pgTable(
  "messaging_accounts",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    delegateId: text("delegate_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    channel: text("channel").notNull(),
    phoneE164: text("phone_e164"),
    externalAccountId: text("external_account_id").notNull(),
    externalBusinessAccountId: text("external_business_account_id"),
    externalConnectionId: text("external_connection_id"),
    displayName: text("display_name"),
    status: messagingAccountStatus("status").notNull().default("PENDING"),
    metadata: jsonb("metadata"),
    // Reference into a secure secret store — never the secret itself
    // (CLAUDE.md sección 5).
    credentialsReference: text("credentials_reference"),
    connectedAt: timestamp("connected_at", { withTimezone: true }),
    disconnectedAt: timestamp("disconnected_at", { withTimezone: true }),
    lastSyncAt: timestamp("last_sync_at", { withTimezone: true }),
    lastError: text("last_error"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [unique().on(table.channel, table.externalAccountId)],
);

export const messagingAccountsRelations = relations(messagingAccounts, ({ one }) => ({
  organization: one(organizations, {
    fields: [messagingAccounts.organizationId],
    references: [organizations.id],
  }),
  delegate: one(users, {
    fields: [messagingAccounts.delegateId],
    references: [users.id],
  }),
}));

export const webhookEvents = pgTable("webhook_events", {
  id: uuid("id").primaryKey().defaultRandom(),
  organizationId: uuid("organization_id")
    .notNull()
    .references(() => organizations.id, { onDelete: "cascade" }),
  messagingAccountId: uuid("messaging_account_id")
    .notNull()
    .references(() => messagingAccounts.id, { onDelete: "cascade" }),
  channel: text("channel").notNull(),
  rawBody: text("raw_body").notNull(),
  headers: jsonb("headers").notNull(),
  receivedAt: timestamp("received_at", { withTimezone: true }).notNull().defaultNow(),
  processedAt: timestamp("processed_at", { withTimezone: true }),
  processingError: text("processing_error"),
});

export const webhookEventsRelations = relations(webhookEvents, ({ one }) => ({
  organization: one(organizations, {
    fields: [webhookEvents.organizationId],
    references: [organizations.id],
  }),
  messagingAccount: one(messagingAccounts, {
    fields: [webhookEvents.messagingAccountId],
    references: [messagingAccounts.id],
  }),
}));
