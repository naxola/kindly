/**
 * Drizzle schema for `contacts`. Scope: PKG-002 — CRM básico.
 *
 * A Contact is a person the organization has a relationship with — never a
 * Kindly user (no login). Phone is stored in E.164 when present, but it is
 * never the technical identity of a messaging integration
 * (docs/PRODUCT.md sección 4, docs/DATABASE.md sección 4).
 */
import { relations, sql } from "drizzle-orm";
import { boolean, pgTable, text, timestamp, uniqueIndex, uuid } from "drizzle-orm/pg-core";
import { organizations } from "@/modules/organizations/schema";
import { users } from "@/modules/auth/schema";

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
  // True only for a Contact auto-created from an unknown inbound sender
  // (findOrCreateConversation, PKG-003) — "Contact → Unassigned"
  // (docs/PRODUCT.md sección 4). Never true for a Contact created through
  // the manual form (PKG-002). Cleared by markContactIdentified (PKG-004).
  isUnassigned: boolean("is_unassigned").notNull().default(false),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const contactsRelations = relations(contacts, ({ one, many }) => ({
  organization: one(organizations, {
    fields: [contacts.organizationId],
    references: [organizations.id],
  }),
  assignments: many(contactAssignments),
}));

/**
 * Who currently answers for a Contact — PKG-014
 * (`docs/DECISIONS.md`, "Asignación de afiliados" y "Delegado de
 * referencia y acceso temporal"). One row per assignment, never updated in
 * place: reassigning closes the current row (`endedAt`) and inserts a new
 * one, so the history of past reference delegates is the table itself, not
 * a separate log.
 *
 * The *current* assignment for a Contact is the row with `endedAt IS NULL`
 * — enforced by a partial unique index, not just application logic, so a
 * concurrent reassignment can never leave two "active" rows for the same
 * Contact.
 *
 * `delegateId` is not restricted to the `DELEGATE` role: any organization
 * member can hold a `MessagingAccount` and receive messages
 * (`messaging_accounts.delegate_id` has the same shape, PKG-003), so an
 * ADMIN can be a Contact's reference delegate too.
 */
export const contactAssignments = pgTable(
  "contact_assignments",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    contactId: uuid("contact_id")
      .notNull()
      .references(() => contacts.id, { onDelete: "cascade" }),
    delegateId: text("delegate_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    startedAt: timestamp("started_at", { withTimezone: true }).notNull().defaultNow(),
    endedAt: timestamp("ended_at", { withTimezone: true }),
    // Null for the assignment a Contact gets automatically (first inbound
    // message, or the backfill migration) — there is no human actor for
    // those, same reasoning as Activity.actorUserId for MESSAGE_RECEIVED.
    assignedBy: text("assigned_by").references(() => users.id, { onDelete: "set null" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("contact_assignments_active_unique").on(table.contactId).where(sql`ended_at is null`),
  ],
);

export const contactAssignmentsRelations = relations(contactAssignments, ({ one }) => ({
  organization: one(organizations, {
    fields: [contactAssignments.organizationId],
    references: [organizations.id],
  }),
  contact: one(contacts, {
    fields: [contactAssignments.contactId],
    references: [contacts.id],
  }),
  delegate: one(users, {
    fields: [contactAssignments.delegateId],
    references: [users.id],
  }),
}));
