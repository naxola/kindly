/**
 * Drizzle schema for `tasks`. Scope: PKG-002 — CRM básico.
 *
 * `conversation_id` is intentionally absent — added by the Messaging core
 * package once `conversations` exists (project/CURRENT_TASK.md). Completion
 * is tracked with `completed_at` instead of an invented status enum: the
 * original brief never specified task states beyond examples, so none are
 * fabricated here.
 */
import { relations } from "drizzle-orm";
import { pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { organizations } from "@/modules/organizations/schema";
import { users } from "@/modules/auth/schema";
import { contacts } from "@/modules/contacts/schema";
import { cases } from "@/modules/cases/schema";

export const tasks = pgTable("tasks", {
  id: uuid("id").primaryKey().defaultRandom(),
  organizationId: uuid("organization_id")
    .notNull()
    .references(() => organizations.id, { onDelete: "cascade" }),
  contactId: uuid("contact_id").references(() => contacts.id, { onDelete: "set null" }),
  caseId: uuid("case_id").references(() => cases.id, { onDelete: "set null" }),
  assignedTo: text("assigned_to").references(() => users.id, { onDelete: "set null" }),
  title: text("title").notNull(),
  description: text("description"),
  dueDate: timestamp("due_date", { withTimezone: true }),
  completedAt: timestamp("completed_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const tasksRelations = relations(tasks, ({ one }) => ({
  organization: one(organizations, {
    fields: [tasks.organizationId],
    references: [organizations.id],
  }),
  contact: one(contacts, {
    fields: [tasks.contactId],
    references: [contacts.id],
  }),
  case: one(cases, {
    fields: [tasks.caseId],
    references: [cases.id],
  }),
  assignee: one(users, {
    fields: [tasks.assignedTo],
    references: [users.id],
  }),
}));
