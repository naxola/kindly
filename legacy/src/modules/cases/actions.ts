"use server";

import { revalidatePath } from "next/cache";
import { requireCurrentOrganizationMember } from "@/modules/organizations/service";
import { createCase, updateCase } from "@/modules/cases/service";
import { caseStatus, type CaseStatus } from "@/modules/cases/schema";
import { linkConversationToCase, unlinkConversationFromCase } from "@/modules/conversations/service";
import { recordActivity } from "@/modules/audit/service";

function isValidStatus(value: string): value is CaseStatus {
  return (caseStatus.enumValues as readonly string[]).includes(value);
}

export async function createCaseAction(formData: FormData) {
  const member = await requireCurrentOrganizationMember();
  const contactId = String(formData.get("contactId") ?? "");
  const title = String(formData.get("title") ?? "").trim();
  if (!contactId || !title) {
    throw new Error("Contact and title are required.");
  }

  await createCase({
    organizationId: member.organizationId,
    actorUserId: member.userId,
    contactId,
    title,
    description: (formData.get("description") as string | null)?.trim() || null,
    priority: (formData.get("priority") as string | null)?.trim() || null,
    assignedTo: (formData.get("assignedTo") as string | null) || null,
  });

  revalidatePath("/cases");
}

export async function updateCaseAction(caseId: string, formData: FormData) {
  const member = await requireCurrentOrganizationMember();
  const title = String(formData.get("title") ?? "").trim();
  const status = String(formData.get("status") ?? "");
  if (!title || !isValidStatus(status)) {
    throw new Error("Title and a valid status are required.");
  }

  const updated = await updateCase({
    organizationId: member.organizationId,
    actorUserId: member.userId,
    caseId,
    title,
    status,
    description: (formData.get("description") as string | null)?.trim() || null,
    priority: (formData.get("priority") as string | null)?.trim() || null,
    assignedTo: (formData.get("assignedTo") as string | null) || null,
  });

  if (!updated) {
    throw new Error("Case not found.");
  }

  revalidatePath("/cases");
  revalidatePath(`/cases/${caseId}`);
}

/** Case detail page (Fase 6): link one of the Contact's conversations to this Case. */
export async function linkConversationToCaseAction(caseId: string, formData: FormData) {
  const member = await requireCurrentOrganizationMember();
  const conversationId = String(formData.get("conversationId") ?? "").trim();
  if (!conversationId) {
    throw new Error("Conversation is required.");
  }

  await linkConversationToCase(member.organizationId, conversationId, caseId);
  await recordActivity({
    organizationId: member.organizationId,
    type: "CASE_CONVERSATION_LINKED",
    actorUserId: member.userId,
    entityType: "case",
    entityId: caseId,
    metadata: { conversationId },
  });

  revalidatePath(`/cases/${caseId}`);
}

/** Case detail page (Fase 6): remove a Conversation ↔ Case link. */
export async function unlinkConversationFromCaseAction(caseId: string, formData: FormData) {
  const member = await requireCurrentOrganizationMember();
  const conversationId = String(formData.get("conversationId") ?? "").trim();
  if (!conversationId) {
    throw new Error("Conversation is required.");
  }

  await unlinkConversationFromCase(member.organizationId, conversationId, caseId);
  await recordActivity({
    organizationId: member.organizationId,
    type: "CASE_CONVERSATION_UNLINKED",
    actorUserId: member.userId,
    entityType: "case",
    entityId: caseId,
    metadata: { conversationId },
  });

  revalidatePath(`/cases/${caseId}`);
}

/**
 * Inbox ficha quick action (Fase 6, UI-10a's "Casos abiertos" section): link
 * the conversation currently open in the panel to one of the Contact's
 * existing cases. No `revalidatePath` — the ficha reloads its own data via
 * `onMutated()`, same as `markContactIdentifiedAction`.
 */
export async function linkCurrentConversationToCaseAction(conversationId: string, formData: FormData) {
  const member = await requireCurrentOrganizationMember();
  const caseId = String(formData.get("caseId") ?? "").trim();
  if (!caseId) {
    throw new Error("Case is required.");
  }

  await linkConversationToCase(member.organizationId, conversationId, caseId);
  await recordActivity({
    organizationId: member.organizationId,
    type: "CASE_CONVERSATION_LINKED",
    actorUserId: member.userId,
    entityType: "case",
    entityId: caseId,
    metadata: { conversationId },
  });
}
