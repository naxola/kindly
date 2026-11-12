/**
 * Drizzle schema for `memberships`. Scope: UI-10b — afiliación
 * (`docs/ui/CONVERSATION_WORKSPACE.md` §5.1).
 *
 * One row per continuous period of affiliation, never mutated into a
 * different period in place — same shape as `contact_assignments`
 * (PKG-014): a Contact can cause baja and later re-join, and "desde
 * cuándo" needs that history, not a single row that forgets it. Baja
 * closes the current row (`endedAt` set) instead of inserting a new
 * closed one, since it doesn't start a new period; re-joining inserts a
 * fresh ACTIVE row. A partial unique index (`ended_at is null`, same
 * expression as `contact_assignments_active_unique`) guarantees at most
 * one open period per Contact.
 *
 * `status` mirrors `endedAt IS NULL` (ACTIVE iff open) — kept as an
 * explicit column so a query never has to re-derive it, but the two are
 * always written together by `memberships/service.ts`, never
 * independently. "Cuota pendiente" is *not* a third status value: it's
 * derived from `feePaidUntil` against the current month
 * (`memberships/domain.ts`), per the user's decision recorded in
 * `docs/DECISIONS.md` (2026-09-28).
 */
import { relations, sql } from "drizzle-orm";
import { date, pgEnum, pgTable, text, timestamp, uniqueIndex, uuid } from "drizzle-orm/pg-core";
import { organizations } from "@/modules/organizations/schema";
import { contacts } from "@/modules/contacts/schema";

export const membershipStatus = pgEnum("membership_status", ["ACTIVE", "INACTIVE"]);
export type MembershipStatus = (typeof membershipStatus.enumValues)[number];

export const memberships = pgTable(
  "memberships",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    contactId: uuid("contact_id")
      .notNull()
      .references(() => contacts.id, { onDelete: "cascade" }),
    memberNumber: text("member_number"),
    status: membershipStatus("status").notNull().default("ACTIVE"),
    startedAt: timestamp("started_at", { withTimezone: true }).notNull().defaultNow(),
    endedAt: timestamp("ended_at", { withTimezone: true }),
    // First day of the last month the fee is paid through (a UI
    // <input type="month"> value normalized to its first day). Null: no
    // fee ever recorded — never treated as "pending", just unknown.
    feePaidUntil: date("fee_paid_until", { mode: "string" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [uniqueIndex("memberships_active_unique").on(table.contactId).where(sql`ended_at is null`)],
);

export const membershipsRelations = relations(memberships, ({ one }) => ({
  organization: one(organizations, {
    fields: [memberships.organizationId],
    references: [organizations.id],
  }),
  contact: one(contacts, {
    fields: [memberships.contactId],
    references: [contacts.id],
  }),
}));
