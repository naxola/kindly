/**
 * Drizzle schema for `activities`. Scope: PKG-002 — CRM básico.
 *
 * `type` is free text (validated in the application layer via
 * `ActivityType`, see service.ts), not a Postgres enum: the list of
 * activity types keeps growing with every future package
 * (Messaging/Knowledge/AI each add their own), and extending a fixed-size
 * enum like `organization_role` is cheap while extending an ever-growing
 * one is not.
 *
 * `entityType`/`entityId` are a polymorphic reference (Contact/Case/Task
 * today; Conversation/Message/AISuggestion/MessagingAccount in future
 * packages) without a foreign key, on purpose — the alternative is adding a
 * new nullable FK column to this table for every future entity that can be
 * audited, which doesn't scale.
 */
import { pgTable, jsonb, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { organizations } from "@/modules/organizations/schema";
import { users } from "@/modules/auth/schema";

export const activities = pgTable("activities", {
  id: uuid("id").primaryKey().defaultRandom(),
  organizationId: uuid("organization_id")
    .notNull()
    .references(() => organizations.id, { onDelete: "cascade" }),
  type: text("type").notNull(),
  actorUserId: text("actor_user_id").references(() => users.id, { onDelete: "set null" }),
  entityType: text("entity_type").notNull(),
  entityId: uuid("entity_id").notNull(),
  metadata: jsonb("metadata"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});
