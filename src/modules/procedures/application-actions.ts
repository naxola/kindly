"use server";

import { revalidatePath } from "next/cache";
import { and, eq } from "drizzle-orm";
import { db } from "@/db/client";
import { requireCurrentOrganizationMember } from "@/modules/organizations/service";
import { getContactForMember } from "@/modules/contacts/service";
import { conversations } from "@/modules/conversations/schema";
import {
  closeApplication,
  getApplicationContactId,
  ProcedureApplicationError,
  setDocumentReceived,
  startProcedureApplication,
} from "@/modules/procedures/applications";

export interface ProcedureActionResult {
  error: string | null;
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const NOT_ALLOWED = "No tienes acceso a este contacto.";

/**
 * Who can manage a Contact's procedures: ADMIN plus the delegates who can see
 * that Contact — the same rule as the ficha and the Membership
 * (`contactVisibilityCondition` via `getContactForMember`), so reaching the
 * ficha is equivalent to being allowed to act on it.
 */
async function requireVisibleContact(contactId: string) {
  const member = await requireCurrentOrganizationMember();
  const contact = await getContactForMember(member.organizationId, member, contactId);
  return contact ? member : null;
}

async function run(work: () => Promise<void>): Promise<ProcedureActionResult> {
  try {
    await work();
    return { error: null };
  } catch (error) {
    // Returned, not thrown: a thrown Server Action error is redacted to a generic message in production.
    if (error instanceof ProcedureApplicationError) return { error: error.message };
    console.error("Procedure action failed:", error instanceof Error ? error.name : "unknown error");
    return { error: "No se pudo completar la acción. Inténtalo de nuevo." };
  }
}

/** Channel of one of this Contact's conversations (the document arrived through it), or null. */
async function channelOf(organizationId: string, contactId: string, conversationId: string | null): Promise<string | null> {
  if (!conversationId || !UUID.test(conversationId)) return null;
  const [row] = await db
    .select({ channel: conversations.channel })
    .from(conversations)
    .where(
      and(
        eq(conversations.organizationId, organizationId),
        eq(conversations.id, conversationId),
        eq(conversations.contactId, contactId),
      ),
    )
    .limit(1);
  return row?.channel ?? null;
}

export async function startProcedureAction(
  contactId: string,
  formData: FormData,
): Promise<ProcedureActionResult> {
  const member = await requireVisibleContact(contactId);
  if (!member) return { error: NOT_ALLOWED };
  const procedureId = String(formData.get("procedureId") ?? "");
  const caseId = String(formData.get("caseId") ?? "") || null;
  if (!UUID.test(procedureId)) return { error: "Elige un trámite." };
  if (caseId !== null && !UUID.test(caseId)) return { error: "El caso no es válido." };

  return run(async () => {
    await startProcedureApplication({
      organizationId: member.organizationId,
      actorUserId: member.userId,
      contactId,
      procedureId,
      caseId,
    });
    revalidatePath(`/contacts/${contactId}`);
  });
}

export async function setDocumentReceivedAction(
  applicationId: string,
  documentId: string,
  received: boolean,
  conversationId: string | null,
): Promise<ProcedureActionResult> {
  if (!UUID.test(applicationId) || !UUID.test(documentId)) return { error: "Trámite no encontrado." };
  const viewer = await requireCurrentOrganizationMember();
  const contactId = await getApplicationContactId(viewer.organizationId, applicationId);
  const member = contactId ? await requireVisibleContact(contactId) : null;
  if (!contactId || !member) return { error: NOT_ALLOWED };

  return run(async () => {
    await setDocumentReceived({
      organizationId: member.organizationId,
      actorUserId: member.userId,
      applicationId,
      documentId,
      received,
      channel: received ? await channelOf(member.organizationId, contactId, conversationId) : null,
    });
    revalidatePath(`/contacts/${contactId}`);
  });
}

export async function closeApplicationAction(
  applicationId: string,
  status: "COMPLETED" | "CANCELLED",
): Promise<ProcedureActionResult> {
  if (!UUID.test(applicationId) || (status !== "COMPLETED" && status !== "CANCELLED")) {
    return { error: "Trámite no encontrado." };
  }
  const viewer = await requireCurrentOrganizationMember();
  const contactId = await getApplicationContactId(viewer.organizationId, applicationId);
  const member = contactId ? await requireVisibleContact(contactId) : null;
  if (!contactId || !member) return { error: NOT_ALLOWED };

  return run(async () => {
    await closeApplication({
      organizationId: member.organizationId,
      actorUserId: member.userId,
      applicationId,
      status,
    });
    revalidatePath(`/contacts/${contactId}`);
  });
}
