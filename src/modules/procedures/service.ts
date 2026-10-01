import "server-only";
import { and, asc, desc, eq, sql } from "drizzle-orm";
import { db } from "@/db/client";
import {
  procedureRequiredDocuments,
  procedures,
  procedureSteps,
  procedureVersions,
} from "@/modules/procedures/schema";
import { recordActivity } from "@/modules/audit/service";

/**
 * Trámites (Fase 7d). Every query filters by `organization_id` explicitly.
 * Reads are open to any member of the organization (a DELEGATE needs the
 * required-documents list); writes are ADMIN-only, enforced by the caller
 * (`actions.ts` → `requireOrganizationAdmin`).
 */

export interface ProcedureContentInput {
  steps: string[];
  requiredDocuments: string[];
}

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];

async function insertVersion(
  tx: Tx,
  procedure: { id: string; organizationId: string },
  version: number,
  content: ProcedureContentInput,
) {
  // Supersede first: the partial unique index allows one CURRENT at a time.
  await tx
    .update(procedureVersions)
    .set({ status: "SUPERSEDED" })
    .where(and(eq(procedureVersions.procedureId, procedure.id), eq(procedureVersions.status, "CURRENT")));

  const [created] = await tx
    .insert(procedureVersions)
    .values({ procedureId: procedure.id, organizationId: procedure.organizationId, version, status: "CURRENT" })
    .returning();

  if (content.steps.length > 0) {
    await tx
      .insert(procedureSteps)
      .values(content.steps.map((title, i) => ({ procedureVersionId: created.id, ordinal: i + 1, title })));
  }
  if (content.requiredDocuments.length > 0) {
    await tx
      .insert(procedureRequiredDocuments)
      .values(content.requiredDocuments.map((name, i) => ({ procedureVersionId: created.id, ordinal: i + 1, name })));
  }
  return created;
}

export interface CreateProcedureInput extends ProcedureContentInput {
  organizationId: string;
  actorUserId: string;
  name: string;
  description?: string | null;
}

/** A new procedure with its first version (1, CURRENT). */
export async function createProcedure(input: CreateProcedureInput) {
  const created = await db.transaction(async (tx) => {
    const [procedure] = await tx
      .insert(procedures)
      .values({
        organizationId: input.organizationId,
        name: input.name,
        description: input.description ?? null,
      })
      .returning();
    await insertVersion(tx, procedure, 1, input);
    return procedure;
  });

  await recordActivity({
    organizationId: input.organizationId,
    type: "PROCEDURE_CREATED",
    actorUserId: input.actorUserId,
    entityType: "procedure",
    entityId: created.id,
  });
  return created;
}

export interface PublishProcedureVersionInput extends ProcedureContentInput {
  organizationId: string;
  actorUserId: string;
  procedureId: string;
}

/**
 * Publish the next version (previous CURRENT becomes SUPERSEDED). Returns
 * null if the procedure does not exist in this organization.
 */
export async function publishProcedureVersion(input: PublishProcedureVersionInput) {
  const version = await db.transaction(async (tx) => {
    const [procedure] = await tx
      .select()
      .from(procedures)
      // FOR UPDATE serializes concurrent publishes so the version number is not computed twice.
      .where(and(eq(procedures.id, input.procedureId), eq(procedures.organizationId, input.organizationId)))
      .for("update")
      .limit(1);
    if (!procedure) {
      return null;
    }

    const [{ latest }] = await tx
      .select({ latest: sql<number>`coalesce(max(${procedureVersions.version}), 0)::int` })
      .from(procedureVersions)
      .where(eq(procedureVersions.procedureId, procedure.id));

    const created = await insertVersion(tx, procedure, latest + 1, input);
    await tx.update(procedures).set({ updatedAt: new Date() }).where(eq(procedures.id, procedure.id));
    return created;
  });

  if (version) {
    await recordActivity({
      organizationId: input.organizationId,
      type: "PROCEDURE_VERSION_PUBLISHED",
      actorUserId: input.actorUserId,
      entityType: "procedure",
      entityId: input.procedureId,
      metadata: { version: version.version },
    });
  }
  return version;
}

/** Procedures of an organization, A–Z, with the current version's number. */
export async function listProcedures(organizationId: string) {
  return db
    .select({
      id: procedures.id,
      name: procedures.name,
      description: procedures.description,
      currentVersion: procedureVersions.version,
    })
    .from(procedures)
    .leftJoin(
      procedureVersions,
      and(eq(procedureVersions.procedureId, procedures.id), eq(procedureVersions.status, "CURRENT")),
    )
    .where(eq(procedures.organizationId, organizationId))
    .orderBy(asc(procedures.name));
}

/** A procedure with every version (newest first), each with its steps and required documents. */
export async function getProcedureWithVersions(organizationId: string, procedureId: string) {
  const [procedure] = await db
    .select()
    .from(procedures)
    .where(and(eq(procedures.id, procedureId), eq(procedures.organizationId, organizationId)))
    .limit(1);
  if (!procedure) {
    return null;
  }

  const versions = await db
    .select()
    .from(procedureVersions)
    .where(and(eq(procedureVersions.procedureId, procedure.id), eq(procedureVersions.organizationId, organizationId)))
    .orderBy(desc(procedureVersions.version));

  const detailed = await Promise.all(
    versions.map(async (version) => {
      const [steps, requiredDocuments] = await Promise.all([
        db
          .select()
          .from(procedureSteps)
          .where(eq(procedureSteps.procedureVersionId, version.id))
          .orderBy(asc(procedureSteps.ordinal)),
        db
          .select()
          .from(procedureRequiredDocuments)
          .where(eq(procedureRequiredDocuments.procedureVersionId, version.id))
          .orderBy(asc(procedureRequiredDocuments.ordinal)),
      ]);
      return { ...version, steps, requiredDocuments };
    }),
  );

  return { procedure, versions: detailed };
}
