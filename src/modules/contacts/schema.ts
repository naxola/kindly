/**
 * Drizzle schema for `contacts`. Scope: PKG-002 — CRM básico.
 *
 * A Contact is a person the organization has a relationship with — never a
 * Kindly user (no login). Phone is stored in E.164 when present, but it is
 * never the technical identity of a messaging integration
 * (docs/PRODUCT.md sección 4, docs/DATABASE.md sección 4).
 */
import { relations } from "drizzle-orm";
import { pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { organizations } from "@/modules/organizations/schema";

export const contacts = pgTable("contacts", {
  id: uuid("id").primaryKey().defaultRandom(),
  organizationId: uuid("organization_id")
    .notNull()
    .references(() => organizations.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  // E.164 (e.g. +34600111222). Nullable: a Contact may be reachable only by
  // email, or not yet fully identified.
  phoneE164: text("phone_e164"),
  email: text("email"),
  notes: text("notes"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const contactsRelations = relations(contacts, ({ one }) => ({
  organization: one(organizations, {
    fields: [contacts.organizationId],
    references: [organizations.id],
  }),
}));
