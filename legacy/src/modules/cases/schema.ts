/**
 * Drizzle schema for `cases`. Scope: PKG-002 — CRM básico.
 *
 * A Case is a matter that needs management — distinct from a Conversation
 * (docs/PRODUCT.md sección 7). `conversation_cases` (N:M with Conversation)
 * is deferred to the Messaging core package, since Conversation doesn't
 * exist yet — see project/CURRENT_TASK.md.
 */
import { relations } from "drizzle-orm";
import { pgEnum, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { organizations } from "@/modules/organizations/schema";
import { users } from "@/modules/auth/schema";
import { contacts } from "@/modules/contacts/schema";

/**
 * The five states documented in docs/PRODUCT.md sección 7 /
 * docs/DATABASE.md sección 9. No workflow/transition restrictions in the
 * MVP — any ADMIN/DELEGATE can set any state.
 */
export const caseStatus = pgEnum("case_status", [
  "OPEN",
  "IN_PROGRESS",
  "WAITING",
  "RESOLVED",
  "CLOSED",
]);
export type CaseStatus = (typeof caseStatus.enumValues)[number];

export const cases = pgTable("cases", {
  id: uuid("id").primaryKey().defaultRandom(),
  organizationId: uuid("organization_id")
    .notNull()
    .references(() => organizations.id, { onDelete: "cascade" }),
  contactId: uuid("contact_id")
    .notNull()
    .references(() => contacts.id, { onDelete: "cascade" }),
  title: text("title").notNull(),
  description: text("description"),
  status: caseStatus("status").notNull().default("OPEN"),
  // Free text on purpose: the original brief never specified fixed priority
  // values, so none are invented here (docs/DECISIONS.md).
  priority: text("priority"),
  assignedTo: text("assigned_to").references(() => users.id, { onDelete: "set null" }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  closedAt: timestamp("closed_at", { withTimezone: true }),
});

export const casesRelations = relations(cases, ({ one }) => ({
  organization: one(organizations, {
    fields: [cases.organizationId],
    references: [organizations.id],
  }),
  contact: one(contacts, {
    fields: [cases.contactId],
    references: [contacts.id],
  }),
  assignee: one(users, {
    fields: [cases.assignedTo],
    references: [users.id],
  }),
}));
