/**
 * Drizzle schema for the affiliate intake (altas received from n8n).
 * See `docs/DECISIONS.md`, "Altas de afiliados por webhook".
 *
 *  - `affiliate_profiles`: the data a Contact has only when it is an
 *    affiliate (DNI, birth date, address, affiliation). 1:1 with `contacts`;
 *    the DNI is unique per organization, which is what detects a duplicate.
 *  - `affiliate_requests`: one row per alta received. `PENDING` waits for the
 *    admin to confirm the delegate; `DUPLICATE` means that DNI already is an
 *    affiliate and the admin decides. Resolved rows stay as the audit trail.
 *  - `integration_keys`: the Bearer token an external system (n8n) uses. Only
 *    its SHA-256 is stored.
 */
import { relations, sql } from "drizzle-orm";
import { date, index, integer, jsonb, pgEnum, pgTable, text, timestamp, uniqueIndex, uuid } from "drizzle-orm/pg-core";
import { organizations } from "@/modules/organizations/schema";
import { users } from "@/modules/auth/schema";
import { contacts } from "@/modules/contacts/schema";
import type { NormalizedAffiliate } from "@/modules/affiliates/normalize";

export const affiliateRequestStatus = pgEnum("affiliate_request_status", ["PENDING", "DUPLICATE", "CONFIRMED", "DISCARDED"]);
export type AffiliateRequestStatus = (typeof affiliateRequestStatus.enumValues)[number];

export const affiliateProfiles = pgTable(
  "affiliate_profiles",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    contactId: uuid("contact_id")
      .notNull()
      .references(() => contacts.id, { onDelete: "cascade" }),
    dni: text("dni").notNull(),
    birthDate: date("birth_date", { mode: "string" }),
    gender: text("gender"),
    streetType: text("street_type"),
    street: text("street"),
    streetNumber: text("street_number"),
    staircase: text("staircase"),
    floor: text("floor"),
    door: text("door"),
    addressOther: text("address_other"),
    country: text("country"),
    postalCode: text("postal_code"),
    city: text("city"),
    addressProvince: text("address_province"),
    province: text("province"),
    sector: text("sector"),
    employmentStatus: text("employment_status"),
    monthlyFeeCents: integer("monthly_fee_cents"),
    workplace: text("workplace"),
    workplaceProvince: text("workplace_province"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("affiliate_profiles_contact_unique").on(table.contactId),
    uniqueIndex("affiliate_profiles_org_dni_unique").on(table.organizationId, table.dni),
  ],
);

export const affiliateRequests = pgTable(
  "affiliate_requests",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    status: affiliateRequestStatus("status").notNull(),
    dni: text("dni").notNull(),
    /** The Contact created on reception (PENDING); null for a DUPLICATE, which creates nothing. */
    contactId: uuid("contact_id").references(() => contacts.id, { onDelete: "set null" }),
    /** For a DUPLICATE: the Contact that already holds that DNI. */
    duplicateOfContactId: uuid("duplicate_of_contact_id").references(() => contacts.id, { onDelete: "set null" }),
    proposedDelegateId: text("proposed_delegate_id").references(() => users.id, { onDelete: "set null" }),
    finalDelegateId: text("final_delegate_id").references(() => users.id, { onDelete: "set null" }),
    /** The normalized alta, kept so a duplicate can be applied later. */
    data: jsonb("data").$type<NormalizedAffiliate>().notNull(),
    receivedAt: timestamp("received_at", { withTimezone: true }).notNull().defaultNow(),
    resolvedBy: text("resolved_by").references(() => users.id, { onDelete: "set null" }),
    resolvedAt: timestamp("resolved_at", { withTimezone: true }),
  },
  (table) => [
    // One open request per DNI: a resend while it waits is answered with the existing one.
    uniqueIndex("affiliate_requests_open_dni_unique")
      .on(table.organizationId, table.dni)
      .where(sql`status in ('PENDING', 'DUPLICATE')`),
    index("affiliate_requests_org_status_idx").on(table.organizationId, table.status),
  ],
);

export const integrationKeys = pgTable(
  "integration_keys",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    purpose: text("purpose").notNull(),
    name: text("name").notNull(),
    /** SHA-256 (hex) of the token; the token itself is shown once and never stored. */
    keyHash: text("key_hash").notNull(),
    /** First characters of the token, to recognize it in the list. */
    keyPrefix: text("key_prefix").notNull(),
    createdBy: text("created_by").references(() => users.id, { onDelete: "set null" }),
    lastUsedAt: timestamp("last_used_at", { withTimezone: true }),
    revokedAt: timestamp("revoked_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [uniqueIndex("integration_keys_hash_unique").on(table.keyHash)],
);

export const affiliateProfilesRelations = relations(affiliateProfiles, ({ one }) => ({
  contact: one(contacts, { fields: [affiliateProfiles.contactId], references: [contacts.id] }),
}));
