"use server";

import { revalidatePath } from "next/cache";
import { requireCurrentOrganizationMember } from "@/modules/organizations/service";
import { createCase, updateCase } from "@/modules/cases/service";
import { caseStatus, type CaseStatus } from "@/modules/cases/schema";

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
