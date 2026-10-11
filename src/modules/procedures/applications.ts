/**
 * Procedures in progress for a Contact (UI-10c, `docs/ui/CONVERSATION_WORKSPACE.md`
 * §5.2): start one under the procedure's *current version*, then track which
 * of its required documents have been received. Kindly stores only that
 * state — never the files themselves.
 *
 * Who may call these (ADMIN and the delegates who can see the Contact) is
 * enforced one layer up, in `application-actions.ts`, through
 * `getContactForMember`; this module enforces multi-tenant isolation
 * (`organization_id` in every query) and the domain rules.
 */
import "server-only";
import { and, asc, desc, eq, inArray } from "drizzle-orm";
import { db } from "@/db/client";
import { cases } from "@/modules/cases/schema";
import { contacts } from "@/modules/contacts/schema";
import { recordActivity } from "@/modules/audit/service";
import {
  procedureApplicationDocuments,
  procedureApplications,
  procedureRequiredDocuments,
  procedures,
  procedureVersions,
  type ProcedureApplicationStatus,
  type ProcedureDocumentStatus,
} from "@/modules/procedures/schema";

/** An error whose message is safe and meant to be shown to the user. */
export class ProcedureApplicationError extends Error {}

export interface StartProcedureInput {
  organizationId: string;
  actorUserId: string;
  contactId: string;
  procedureId: string;
  /** Optional: the Case this procedure belongs to (must be one of the same Contact). */
  caseId?: string | null;
}

export async function startProcedureApplication(input: StartProcedureInput) {
  const [contact] = await db
    .select({ id: contacts.id })
    .from(contacts)
    .where(and(eq(contacts.organizationId, input.organizationId), eq(contacts.id, input.contactId)))
    .limit(1);
  if (!contact) throw new ProcedureApplicationError("El contacto no existe.");

  const [version] = await db
    .select({ id: procedureVersions.id, version: procedureVersions.version })
    .from(procedureVersions)
    .innerJoin(procedures, eq(procedures.id, procedureVersions.procedureId))
    .where(
      and(
        eq(procedures.organizationId, input.organizationId),
        eq(procedures.id, input.procedureId),
        eq(procedureVersions.organizationId, input.organizationId),
        eq(procedureVersions.status, "CURRENT"),
      ),
    )
    .limit(1);
  if (!version) throw new ProcedureApplicationError("El trámite no existe o no tiene una versión publicada.");

  if (input.caseId) {
    const [linked] = await db
      .select({ id: cases.id })
      .from(cases)
      .where(
        and(
          eq(cases.organizationId, input.organizationId),
          eq(cases.id, input.caseId),
          eq(cases.contactId, input.contactId),
        ),
      )
      .limit(1);
    if (!linked) throw new ProcedureApplicationError("El caso no pertenece a este contacto.");
  }

  const required = await db
    .select({ id: procedureRequiredDocuments.id })
    .from(procedureRequiredDocuments)
    .where(eq(procedureRequiredDocuments.procedureVersionId, version.id))
    .orderBy(asc(procedureRequiredDocuments.ordinal));

  const application = await db.transaction(async (tx) => {
    const [duplicate] = await tx
      .select({ id: procedureApplications.id })
      .from(procedureApplications)
      .where(
        and(
          eq(procedureApplications.organizationId, input.organizationId),
          eq(procedureApplications.contactId, input.contactId),
          eq(procedureApplications.procedureId, input.procedureId),
          eq(procedureApplications.status, "ACTIVE"),
        ),
      )
      .limit(1);
    if (duplicate) throw new ProcedureApplicationError("Ya hay un trámite en curso de este tipo para este contacto.");

    const [created] = await tx
      .insert(procedureApplications)
      .values({
        organizationId: input.organizationId,
        contactId: input.contactId,
        caseId: input.caseId ?? null,
        procedureId: input.procedureId,
        procedureVersionId: version.id,
        startedBy: input.actorUserId,
      })
      .returning();
    if (required.length > 0) {
      await tx.insert(procedureApplicationDocuments).values(
        required.map((doc) => ({
          applicationId: created.id,
          organizationId: input.organizationId,
          requiredDocumentId: doc.id,
        })),
      );
    }
    return created;
  });

  await recordActivity({
    organizationId: input.organizationId,
    type: "PROCEDURE_STARTED",
    actorUserId: input.actorUserId,
    entityType: "contact",
    entityId: input.contactId,
    metadata: { applicationId: application.id, procedureId: input.procedureId, version: version.version },
  });
  return application;
}

export interface ApplicationDocumentView {
  id: string;
  name: string;
  status: ProcedureDocumentStatus;
  receivedAt: Date | null;
  receivedChannel: string | null;
  receivedMessageId: string | null;
}

export interface ApplicationView {
  id: string;
  caseId: string | null;
  procedureId: string;
  procedureName: string;
  version: number;
  status: ProcedureApplicationStatus;
  createdAt: Date;
  documents: ApplicationDocumentView[];
}

/** The Contact's procedures (open ones by default), newest first, each with its documents in procedure order. */
export async function listApplicationsForContact(
  organizationId: string,
  contactId: string,
  options: { includeClosed?: boolean } = {},
): Promise<ApplicationView[]> {
  const apps = await db
    .select({
      id: procedureApplications.id,
      caseId: procedureApplications.caseId,
      procedureId: procedureApplications.procedureId,
      procedureName: procedures.name,
      version: procedureVersions.version,
      status: procedureApplications.status,
      createdAt: procedureApplications.createdAt,
    })
    .from(procedureApplications)
    .innerJoin(procedures, eq(procedures.id, procedureApplications.procedureId))
    .innerJoin(procedureVersions, eq(procedureVersions.id, procedureApplications.procedureVersionId))
    .where(
      and(
        eq(procedureApplications.organizationId, organizationId),
        eq(procedureApplications.contactId, contactId),
        options.includeClosed ? undefined : eq(procedureApplications.status, "ACTIVE"),
      ),
    )
    .orderBy(desc(procedureApplications.createdAt));
  if (apps.length === 0) return [];

  const docs = await db
    .select({
      id: procedureApplicationDocuments.id,
      applicationId: procedureApplicationDocuments.applicationId,
      name: procedureRequiredDocuments.name,
      status: procedureApplicationDocuments.status,
      receivedAt: procedureApplicationDocuments.receivedAt,
      receivedChannel: procedureApplicationDocuments.receivedChannel,
      receivedMessageId: procedureApplicationDocuments.receivedMessageId,
    })
    .from(procedureApplicationDocuments)
    .innerJoin(procedureRequiredDocuments, eq(procedureRequiredDocuments.id, procedureApplicationDocuments.requiredDocumentId))
    .where(
      and(
        eq(procedureApplicationDocuments.organizationId, organizationId),
        inArray(
          procedureApplicationDocuments.applicationId,
          apps.map((app) => app.id),
        ),
      ),
    )
    .orderBy(asc(procedureRequiredDocuments.ordinal));

  return apps.map((app) => ({
    ...app,
    documents: docs
      .filter((doc) => doc.applicationId === app.id)
      .map((doc) => ({
        id: doc.id,
        name: doc.name,
        status: doc.status,
        receivedAt: doc.receivedAt,
        receivedChannel: doc.receivedChannel,
        receivedMessageId: doc.receivedMessageId,
      })),
  }));
}

/** Procedures that can be started for this Contact: published, and not already open for it. */
export async function listStartableProcedures(organizationId: string, contactId: string) {
  const open = await db
    .select({ procedureId: procedureApplications.procedureId })
    .from(procedureApplications)
    .where(
      and(
        eq(procedureApplications.organizationId, organizationId),
        eq(procedureApplications.contactId, contactId),
        eq(procedureApplications.status, "ACTIVE"),
      ),
    );
  const openIds = new Set(open.map((row) => row.procedureId));
  const published = await db
    .select({ id: procedures.id, name: procedures.name, version: procedureVersions.version })
    .from(procedures)
    .innerJoin(
      procedureVersions,
      and(eq(procedureVersions.procedureId, procedures.id), eq(procedureVersions.status, "CURRENT")),
    )
    .where(eq(procedures.organizationId, organizationId))
    .orderBy(asc(procedures.name));
  return published.filter((procedure) => !openIds.has(procedure.id));
}

/** Which Contact an application belongs to — for the visibility check one layer up. */
export async function getApplicationContactId(organizationId: string, applicationId: string): Promise<string | null> {
  const [row] = await db
    .select({ contactId: procedureApplications.contactId })
    .from(procedureApplications)
    .where(and(eq(procedureApplications.organizationId, organizationId), eq(procedureApplications.id, applicationId)))
    .limit(1);
  return row?.contactId ?? null;
}

export interface SetDocumentReceivedInput {
  organizationId: string;
  actorUserId: string;
  applicationId: string;
  /** `procedure_application_documents.id`. */
  documentId: string;
  received: boolean;
  /** Channel the document arrived through (only stored when marking as received). */
  channel?: string | null;
}

/** Marks a document of an open procedure as received (or back to missing). */
export async function setDocumentReceived(input: SetDocumentReceivedInput): Promise<void> {
  const [application] = await db
    .select()
    .from(procedureApplications)
    .where(and(eq(procedureApplications.organizationId, input.organizationId), eq(procedureApplications.id, input.applicationId)))
    .limit(1);
  if (!application) throw new ProcedureApplicationError("El trámite no existe.");
  if (application.status !== "ACTIVE") throw new ProcedureApplicationError("Este trámite ya está cerrado.");

  const updated = await db
    .update(procedureApplicationDocuments)
    .set(
      input.received
        ? { status: "RECEIVED", receivedAt: new Date(), receivedChannel: input.channel ?? null, markedBy: input.actorUserId }
        : { status: "REQUIRED", receivedAt: null, receivedChannel: null, receivedMessageId: null, markedBy: input.actorUserId },
    )
    .where(
      and(
        eq(procedureApplicationDocuments.organizationId, input.organizationId),
        eq(procedureApplicationDocuments.applicationId, input.applicationId),
        eq(procedureApplicationDocuments.id, input.documentId),
      ),
    )
    .returning({ id: procedureApplicationDocuments.id });
  if (updated.length === 0) throw new ProcedureApplicationError("El documento no pertenece a este trámite.");

  await recordActivity({
    organizationId: input.organizationId,
    type: input.received ? "PROCEDURE_DOCUMENT_RECEIVED" : "PROCEDURE_DOCUMENT_UNMARKED",
    actorUserId: input.actorUserId,
    entityType: "contact",
    entityId: application.contactId,
    metadata: { applicationId: application.id, documentId: input.documentId },
  });
}

/** Ends an open procedure: terminated (`COMPLETED`) or abandoned (`CANCELLED`). */
export async function closeApplication(input: {
  organizationId: string;
  actorUserId: string;
  applicationId: string;
  status: Extract<ProcedureApplicationStatus, "COMPLETED" | "CANCELLED">;
}): Promise<void> {
  const updated = await db
    .update(procedureApplications)
    .set({ status: input.status, closedAt: new Date() })
    .where(
      and(
        eq(procedureApplications.organizationId, input.organizationId),
        eq(procedureApplications.id, input.applicationId),
        eq(procedureApplications.status, "ACTIVE"),
      ),
    )
    .returning({ contactId: procedureApplications.contactId });
  if (updated.length === 0) throw new ProcedureApplicationError("Este trámite ya está cerrado o no existe.");

  await recordActivity({
    organizationId: input.organizationId,
    type: input.status === "COMPLETED" ? "PROCEDURE_COMPLETED" : "PROCEDURE_CANCELLED",
    actorUserId: input.actorUserId,
    entityType: "contact",
    entityId: updated[0].contactId,
    metadata: { applicationId: input.applicationId },
  });
}
