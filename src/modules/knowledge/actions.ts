"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { after } from "next/server";
import { requireOrganizationAdmin } from "@/modules/organizations/service";
import { getDocumentWithVersions } from "@/modules/knowledge/service";
import { reindexKnowledgeChunks } from "@/modules/knowledge/reindex";
import { createImportBatch, processImportBatch, retryFailedImportPages } from "@/modules/knowledge/site-import";
import { uploadKnowledgeDocument, uploadKnowledgeVersion, UploadError } from "@/modules/knowledge/upload";
import {
  parseDocumentFields,
  parseVersionFields,
  resolveUploadedSource,
  validateWebUrl,
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

/**
 * ADMIN-only. Re-embeds one of the organization's own documents with the
 * active provider (after a provider switch). Public GLOBAL knowledge is
 * operator-managed, so an organization admin can never reindex it here.
 * Synchronous: one document is bounded, unlike the whole-table cron job.
 */
export async function reindexKnowledgeSourceAction(documentId: string): Promise<void> {
  const member = await requireOrganizationAdmin();
  const found = await getDocumentWithVersions(documentId, member.organizationId);
  if (!found || found.document.organizationId !== member.organizationId) {
    throw new Error("Documento no encontrado.");
  }
  await reindexKnowledgeChunks({ documentId });
  revalidatePath("/knowledge");
  revalidatePath(`/knowledge/${documentId}`);
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const optionalText = (data: FormData, key: string) => String(data.get(key) ?? "").trim() || null;

/**
 * ADMIN-only. Queues the pages chosen on the discovery screen and starts
 * indexing them after the response (`after`), then goes to the progress page,
 * which keeps indexing in slices while pages remain. Always ORGANIZATION
 * knowledge, one document per page.
 */
export async function startSiteImportAction(_previous: UploadFormState, formData: FormData): Promise<UploadFormState> {
  const member = await requireOrganizationAdmin();

  const site = validateWebUrl(String(formData.get("siteUrl") ?? ""));
  if (!site.ok) return { error: site.error, values: echo(formData) };
  const fields = parseVersionFields(formData);
  if (!fields.ok) return { error: fields.error, values: echo(formData) };

  const pages = formData.getAll("page").flatMap((value) =>
    typeof value === "string" && value
      ? [{ url: value, title: optionalText(formData, `title:${value}`) }]
      : [],
  );

  let batchId: string;
  try {
    ({ batchId } = await createImportBatch({
      organizationId: member.organizationId,
      actorUserId: member.userId,
      siteUrl: site.value,
      pages,
      options: {
        version: fields.value.version,
        status: fields.value.status,
        effectiveFrom: fields.value.effectiveFrom,
        effectiveUntil: fields.value.effectiveUntil,
        sourceNote: fields.value.sourceNote,
        jurisdiction: optionalText(formData, "jurisdiction"),
        territory: optionalText(formData, "territory"),
        scope: optionalText(formData, "scope"),
      },
    }));
  } catch (error) {
    if (error instanceof UploadError) return { error: error.message, values: echo(formData) };
    console.error("Site import could not be queued", error);
    return { error: "No se pudo preparar la importación. Inténtalo de nuevo.", values: echo(formData) };
  }

  after(async () => {
    try {
      await processImportBatch(member.organizationId, batchId);
    } catch (error) {
      console.error("Site import slice failed:", error instanceof Error ? error.name : "unknown error");
    }
  });
  revalidatePath("/knowledge");
  redirect(`/knowledge/sitio/${batchId}`);
}

export interface ImportSliceResult {
  remaining: number;
  error: string | null;
}

/** ADMIN-only. One more time-boxed slice of a batch; the progress page calls it while pages remain. */
export async function continueSiteImportAction(batchId: string): Promise<ImportSliceResult> {
  const member = await requireOrganizationAdmin();
  if (!UUID.test(batchId)) return { remaining: 0, error: "Importación no encontrada." };
  try {
    const { remaining } = await processImportBatch(member.organizationId, batchId);
    return { remaining, error: null };
  } catch (error) {
    if (error instanceof UploadError) return { remaining: 0, error: error.message };
    console.error("Site import slice failed:", error instanceof Error ? error.name : "unknown error");
    return { remaining: 0, error: "No se pudo continuar la importación." };
  }
}

/** ADMIN-only. Puts the failed pages of a batch back in the queue. */
export async function retryFailedImportAction(batchId: string): Promise<void> {
  const member = await requireOrganizationAdmin();
  if (!UUID.test(batchId)) return;
  await retryFailedImportPages(member.organizationId, batchId);
  revalidatePath(`/knowledge/sitio/${batchId}`);
}
