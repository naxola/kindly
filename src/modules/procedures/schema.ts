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

export const proceduresRelations = relations(procedures, ({ one, many }) => ({
  organization: one(organizations, { fields: [procedures.organizationId], references: [organizations.id] }),
  versions: many(procedureVersions),
}));
