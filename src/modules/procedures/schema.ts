/**
 * Drizzle schema for Trámites (`Procedure`, Fase 7d): what an organization
 * defines as "how we handle X" — its steps and the documents it requires —
 * versioned so that editing a procedure never rewrites what a past
 * conversation/case was handled under (`docs/ui/CONVERSATION_WORKSPACE.md`
 * §5.2). Private to each organization (no GLOBAL procedures), so unlike
 * `knowledge/schema.ts` there is no visibility column: `organization_id` is
 * always set. Kindly stores the *definition* only, never a member's files.
 *
 * `procedure_versions.organization_id` is denormalized from the parent so
 * every read can filter by tenant without a join (defense in depth,
 * `CLAUDE.md` §5) — copied by the service, never taken from the caller.
 */
import { relations, sql } from "drizzle-orm";
import { index, integer, pgEnum, pgTable, text, timestamp, unique, uniqueIndex, uuid } from "drizzle-orm/pg-core";
import { users } from "@/modules/auth/schema";
import { cases } from "@/modules/cases/schema";
import { contacts } from "@/modules/contacts/schema";
import { messages } from "@/modules/conversations/schema";
import { organizations } from "@/modules/organizations/schema";

/** No DRAFT/REPEALED: a procedure is the organization's own rule, published or replaced, not legislation. */
export const procedureVersionStatus = pgEnum("procedure_version_status", ["CURRENT", "SUPERSEDED"]);
export type ProcedureVersionStatus = (typeof procedureVersionStatus.enumValues)[number];

export const procedures = pgTable(
  "procedures",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    description: text("description"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index("procedures_org_idx").on(table.organizationId)],
);

export const procedureVersions = pgTable(
  "procedure_versions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    procedureId: uuid("procedure_id")
      .notNull()
      .references(() => procedures.id, { onDelete: "cascade" }),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    /** 1, 2, 3… per procedure. */
    version: integer("version").notNull(),
    status: procedureVersionStatus("status").notNull().default("CURRENT"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    unique("procedure_versions_procedure_version_unique").on(table.procedureId, table.version),
    // At most one CURRENT per procedure; publishing supersedes the previous.
    uniqueIndex("procedure_versions_current_unique")
      .on(table.procedureId)
      .where(sql`status = 'CURRENT'`),
  ],
);

export const procedureSteps = pgTable(
  "procedure_steps",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    procedureVersionId: uuid("procedure_version_id")
      .notNull()
      .references(() => procedureVersions.id, { onDelete: "cascade" }),
    ordinal: integer("ordinal").notNull(),
    title: text("title").notNull(),
  },
  (table) => [unique("procedure_steps_version_ordinal_unique").on(table.procedureVersionId, table.ordinal)],
);

/** One row per document the procedure requires; a future per-case state (UI-10c) points at this id. */
export const procedureRequiredDocuments = pgTable(
  "procedure_required_documents",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    procedureVersionId: uuid("procedure_version_id")
      .notNull()
      .references(() => procedureVersions.id, { onDelete: "cascade" }),
    ordinal: integer("ordinal").notNull(),
    name: text("name").notNull(),
  },
  (table) => [
    unique("procedure_required_documents_version_ordinal_unique").on(table.procedureVersionId, table.ordinal),
  ],
);

export const procedureApplicationStatus = pgEnum("procedure_application_status", ["ACTIVE", "COMPLETED", "CANCELLED"]);
export type ProcedureApplicationStatus = (typeof procedureApplicationStatus.enumValues)[number];

/**
 * A procedure in progress for a Contact ("trámite en curso", UI-10c,
 * `docs/ui/CONVERSATION_WORKSPACE.md` §5.2): which procedure, under which
 * *version* (so editing the procedure later never rewrites what this one
 * was handled under) and, optionally, which Case it belongs to. Holds the
 * state of the required documents and nothing else — Kindly never stores a
 * member's files.
 */
export const procedureApplications = pgTable(
  "procedure_applications",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    contactId: uuid("contact_id")
      .notNull()
      .references(() => contacts.id, { onDelete: "cascade" }),
    caseId: uuid("case_id").references(() => cases.id, { onDelete: "set null" }),
    procedureId: uuid("procedure_id")
      .notNull()
      .references(() => procedures.id, { onDelete: "cascade" }),
    procedureVersionId: uuid("procedure_version_id")
      .notNull()
      .references(() => procedureVersions.id, { onDelete: "cascade" }),
    status: procedureApplicationStatus("status").notNull().default("ACTIVE"),
    startedBy: text("started_by").references(() => users.id, { onDelete: "set null" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    closedAt: timestamp("closed_at", { withTimezone: true }),
  },
  (table) => [
    index("procedure_applications_org_contact_idx").on(table.organizationId, table.contactId, table.status),
    // One open procedure of each kind per Contact; closing it allows starting it again.
    uniqueIndex("procedure_applications_active_unique")
      .on(table.contactId, table.procedureId)
      .where(sql`status = 'ACTIVE'`),
  ],
);

export const procedureDocumentStatus = pgEnum("procedure_document_status", ["REQUIRED", "RECEIVED"]);
export type ProcedureDocumentStatus = (typeof procedureDocumentStatus.enumValues)[number];

/** Per-application state of one required document: waiting, or received (when, through which channel, optionally which message). */
export const procedureApplicationDocuments = pgTable(
  "procedure_application_documents",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    applicationId: uuid("application_id")
      .notNull()
      .references(() => procedureApplications.id, { onDelete: "cascade" }),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    requiredDocumentId: uuid("required_document_id")
      .notNull()
      .references(() => procedureRequiredDocuments.id, { onDelete: "cascade" }),
    status: procedureDocumentStatus("status").notNull().default("REQUIRED"),
    receivedAt: timestamp("received_at", { withTimezone: true }),
    receivedChannel: text("received_channel"),
    receivedMessageId: uuid("received_message_id").references(() => messages.id, { onDelete: "set null" }),
    markedBy: text("marked_by").references(() => users.id, { onDelete: "set null" }),
  },
  (table) => [unique("procedure_application_documents_unique").on(table.applicationId, table.requiredDocumentId)],
);

export const proceduresRelations = relations(procedures, ({ one, many }) => ({
  organization: one(organizations, { fields: [procedures.organizationId], references: [organizations.id] }),
  versions: many(procedureVersions),
}));
