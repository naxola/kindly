/**
 * Drizzle schema for `organizations` and `organization_members`.
 *
 * Scope: PKG-001 — Foundation, extended by PKG-006 with
 * `organization_invitations`. No teams, no billing.
 * See `docs/DATABASE.md` sección 3 y `docs/DECISIONS.md` (entrada sobre
 * por qué no se usa el plugin `organization` de Better Auth).
 */
import { relations, sql } from "drizzle-orm";
import { pgEnum, pgTable, text, timestamp, unique, uniqueIndex, uuid } from "drizzle-orm/pg-core";
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
    // A user has exactly one Organization in this MVP model (no
    // multi-organization membership yet — docs/DECISIONS.md). This is also
    // what makes the self-heal path in
    // getCurrentOrganizationMember/bootstrapOrganizationForUser safe under
    // concurrency: two simultaneous requests for a brand-new session both
    // trying to bootstrap an org race on this constraint, and the loser
    // re-queries instead of ending up with two organizations.
    unique("organization_members_user_unique").on(table.userId),
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

export const invitationStatus = pgEnum("invitation_status", ["PENDING", "ACCEPTED", "REVOKED"]);
export type InvitationStatus = (typeof invitationStatus.enumValues)[number];

/**
 * Invitations to join an Organization (PKG-006). Before this, every signup
 * created its own Organization and every user was its ADMIN, so a DELEGATE
 * could not exist at all.
 *
 * `email` is the link between an invitation and the person who accepts it:
 * acceptance happens in the user-creation hook by matching the new
 * account's email, not by carrying a token through the signup flow. Stored
 * lowercased so that matching is not case-sensitive.
 *
 * `token` only addresses the invitation page (`/invite/<token>`); it is not
 * what grants membership. It is random and unguessable so that the URL can
 * be shared directly — Kindly does not send email (no mail infrastructure
 * yet, see docs/DECISIONS.md), the ADMIN copies the link.
 */
export const organizationInvitations = pgTable(
  "organization_invitations",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    email: text("email").notNull(),
    role: organizationRole("role").notNull(),
    token: text("token").notNull(),
    invitedByUserId: text("invited_by_user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    status: invitationStatus("status").notNull().default("PENDING"),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    acceptedAt: timestamp("accepted_at", { withTimezone: true }),
    acceptedByUserId: text("accepted_by_user_id").references(() => users.id, { onDelete: "set null" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    unique("organization_invitations_token_unique").on(table.token),
    // Only *pending* invitations are unique per (organization, email): a
    // revoked or already-accepted one must not block inviting that address
    // again. A plain unique constraint cannot express that, hence the
    // partial index.
    uniqueIndex("organization_invitations_pending_unique")
      .on(table.organizationId, table.email)
      .where(sql`status = 'PENDING'`),
  ],
);

export const organizationInvitationsRelations = relations(organizationInvitations, ({ one }) => ({
  organization: one(organizations, {
    fields: [organizationInvitations.organizationId],
    references: [organizations.id],
  }),
}));
