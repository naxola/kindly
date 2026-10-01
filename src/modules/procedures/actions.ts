"use server";

import { revalidatePath } from "next/cache";
import { requireOrganizationAdmin } from "@/modules/organizations/service";
import { createProcedure, publishProcedureVersion } from "@/modules/procedures/service";
import { parseLineList } from "@/modules/procedures/domain";

/** ADMIN-only (`docs/DECISIONS.md`, Fase 7d): delegates read procedures, never edit them. */
export async function createProcedureAction(formData: FormData) {
  const member = await requireOrganizationAdmin();
  const name = String(formData.get("name") ?? "").trim();
  if (!name) {
    throw new Error("Name is required.");
  }

  await createProcedure({
    organizationId: member.organizationId,
    actorUserId: member.userId,
    name,
    description: (formData.get("description") as string | null)?.trim() || null,
    steps: parseLineList(String(formData.get("steps") ?? "")),
    requiredDocuments: parseLineList(String(formData.get("requiredDocuments") ?? "")),
  });

  revalidatePath("/knowledge/procedures");
}

export async function publishProcedureVersionAction(procedureId: string, formData: FormData) {
  const member = await requireOrganizationAdmin();
  const version = await publishProcedureVersion({
    organizationId: member.organizationId,
    actorUserId: member.userId,
    procedureId,
    steps: parseLineList(String(formData.get("steps") ?? "")),
    requiredDocuments: parseLineList(String(formData.get("requiredDocuments") ?? "")),
  });
  if (!version) {
    throw new Error("Procedure not found.");
  }

  revalidatePath("/knowledge/procedures");
  revalidatePath(`/knowledge/procedures/${procedureId}`);
}
