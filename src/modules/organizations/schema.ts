/**
 * Drizzle schema for `organizations` and `organization_members`.
 *
 * Scope: PKG-001 — Foundation. Only the columns needed to represent the
 * tenant and its members exist here; no invitations, no teams, no billing.
 * See `docs/DATABASE.md` sección 3 y `docs/DECISIONS.md` (entrada sobre
 * por qué no se usa el plugin `organization` de Better Auth).
 */
import { relations } from "drizzle-orm";
import { pgEnum, pgTable, text, timestamp, unique, uuid } from "drizzle-orm/pg-core";
import { users } from "@/modules/auth/schema";

/**
 * Only two roles exist in the MVP (`docs/PRODUCT.md` sección 3). This is a
 * real Postgres enum, not just a TypeScript union, so the database itself
 * rejects an invalid role (acceptance criterion 7 de PKG-001).
 */
export const organizationRole = pgEnum("organization_role", ["ADMIN", "DELEGATE"]);
export type OrganizationRole = (typeof organizationRole.enumValues)[number];

export const organizations = pgTable("organizations", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const organizationMembers = pgTable(
  "organization_members",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    role: organizationRole("role").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    // A user can only belong to a given organization once.
    unique("organization_members_org_user_unique").on(table.organizationId, table.userId),
  ],
);

export const organizationsRelations = relations(organizations, ({ many }) => ({
  members: many(organizationMembers),
}));

export const organizationMembersRelations = relations(organizationMembers, ({ one }) => ({
  organization: one(organizations, {
    fields: [organizationMembers.organizationId],
    references: [organizations.id],
  }),
  user: one(users, {
    fields: [organizationMembers.userId],
    references: [users.id],
  }),
}));
