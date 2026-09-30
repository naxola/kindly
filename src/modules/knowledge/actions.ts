"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireOrganizationAdmin } from "@/modules/organizations/service";
import { uploadKnowledgeDocument, uploadKnowledgeVersion, UploadError } from "@/modules/knowledge/upload";
import {
  parseDocumentFields,
  parseVersionFields,
  resolveUploadedSource,
} from "@/modules/knowledge/ingestion/upload-validation";

export interface UploadFormState {
  error: string | null;
  /** The submitted text fields, echoed back: React resets an uncontrolled form after an action, which would wipe everything on a validation error. Files cannot be echoed. */
  values?: Record<string, string>;
}

function echo(formData: FormData): Record<string, string> {
  return Object.fromEntries([...formData.entries()].filter((entry): entry is [string, string] => typeof entry[1] === "string"));
}

async function toFormState(formData: FormData, work: () => Promise<string>): Promise<UploadFormState> {
  let documentId: string;
  try {
    documentId = await work();
  } catch (error) {
    if (error instanceof UploadError) {
      return { error: error.message, values: echo(formData) };
    }
    console.error("Knowledge upload failed", error);
    return { error: "No se pudo guardar el documento. Inténtalo de nuevo.", values: echo(formData) };
  }
  revalidatePath("/knowledge");
  revalidatePath(`/knowledge/${documentId}`);
  redirect(`/knowledge/${documentId}`);
}

/**
 * ADMIN-only (`docs/DECISIONS.md`, Fase 7d/7f). Returns a form state instead
 * of throwing so the form can show what is wrong; always creates
 * ORGANIZATION knowledge — never GLOBAL.
 */
export async function uploadKnowledgeDocumentAction(
  _previous: UploadFormState,
  formData: FormData,
): Promise<UploadFormState> {
  const member = await requireOrganizationAdmin();

  const document = parseDocumentFields(formData);
  if (!document.ok) return { error: document.error, values: echo(formData) };
  const fields = parseVersionFields(formData);
  if (!fields.ok) return { error: fields.error, values: echo(formData) };
  const source = await resolveUploadedSource(fields.value);
  if (!source.ok) return { error: source.error, values: echo(formData) };

  return toFormState(formData, async () => {
    const created = await uploadKnowledgeDocument({
      organizationId: member.organizationId,
      actorUserId: member.userId,
      document: document.value,
      fields: fields.value,
      source: source.value,
    });
    return created.id;
  });
}

export async function uploadKnowledgeVersionAction(
  documentId: string,
  _previous: UploadFormState,
  formData: FormData,
): Promise<UploadFormState> {
  const member = await requireOrganizationAdmin();

  const fields = parseVersionFields(formData);
  if (!fields.ok) return { error: fields.error, values: echo(formData) };
  const source = await resolveUploadedSource(fields.value);
  if (!source.ok) return { error: source.error, values: echo(formData) };

  return toFormState(formData, async () => {
    const updated = await uploadKnowledgeVersion({
      organizationId: member.organizationId,
      actorUserId: member.userId,
      documentId,
      fields: fields.value,
      source: source.value,
    });
    return updated.id;
  });
}
