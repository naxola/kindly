"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { after } from "next/server";
import { requireOrganizationAdmin } from "@/modules/organizations/service";
import { getDocumentWithVersions } from "@/modules/knowledge/service";
import { reindexKnowledgeChunks } from "@/modules/knowledge/reindex";
import {
  addWebsite,
  addWebsitePage,
  deleteWebsite,
  processWebsitePages,
  queueWebsitePages,
  refreshWebsitePages,
  reindexWebsiteDocuments,
  retryFailedWebsitePages,
  updateWebsiteOptions,
} from "@/modules/knowledge/websites";
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
const NOT_FOUND = "Sitio web no encontrado.";

const optionalText = (data: FormData, key: string) => String(data.get(key) ?? "").trim() || null;

/** Runs a website action, turning an `UploadError` into its message and anything else into a generic one. */
async function guarded<T extends object>(work: () => Promise<T>): Promise<T | { error: string }> {
  try {
    return await work();
  } catch (error) {
    if (error instanceof UploadError) return { error: error.message };
    console.error("Website action failed:", error instanceof Error ? error.name : "unknown error");
    return { error: "No se pudo completar la acción. Inténtalo de nuevo." };
  }
}

export type WebsiteActionResult<T extends object = object> = ({ error: null } & T) | { error: string };

/**
 * ADMIN-only. Adds a website: reads its name and preview, discovers its pages
 * and stores them as candidates. The caller opens the website panel with the
 * returned id (an address the organization already has returns that site's id).
 */
export async function addWebsiteAction(url: string): Promise<WebsiteActionResult<{ websiteId: string }>> {
  const member = await requireOrganizationAdmin();
  const result = await guarded(() =>
    addWebsite({ organizationId: member.organizationId, actorUserId: member.userId, url }),
  );
  if ("error" in result) return result;
  revalidatePath("/knowledge");
  return { error: null, websiteId: result.websiteId };
}

/**
 * ADMIN-only. Queues the chosen pages and starts indexing them after the
 * response (`after`); the open website panel keeps indexing in slices while
 * pages remain. Always ORGANIZATION knowledge, one document per page.
 */
export async function queueWebsitePagesAction(
  websiteId: string,
  urls: string[],
): Promise<WebsiteActionResult<{ queued: number }>> {
  const member = await requireOrganizationAdmin();
  if (!UUID.test(websiteId)) return { error: NOT_FOUND };
  const result = await guarded(async () => ({ queued: await queueWebsitePages(member.organizationId, websiteId, urls) }));
  if ("error" in result) return result;

  after(async () => {
    try {
      await processWebsitePages(member.organizationId, websiteId, { actorUserId: member.userId });
    } catch (error) {
      console.error("Website slice failed:", error instanceof Error ? error.name : "unknown error");
    }
  });
  revalidatePath("/knowledge");
  return { error: null, queued: result.queued };
}

/** ADMIN-only. One more time-boxed slice; the open panel calls it while pages remain. */
export async function continueWebsiteImportAction(websiteId: string): Promise<WebsiteActionResult<{ remaining: number }>> {
  const member = await requireOrganizationAdmin();
  if (!UUID.test(websiteId)) return { error: NOT_FOUND };
  const result = await guarded(() =>
    processWebsitePages(member.organizationId, websiteId, { actorUserId: member.userId }),
  );
  if ("error" in result) return result;
  return { error: null, remaining: result.remaining };
}

/** ADMIN-only. Puts the failed pages back in the queue (the open panel then indexes them). */
export async function retryFailedWebsitePagesAction(websiteId: string): Promise<WebsiteActionResult<{ queued: number }>> {
  const member = await requireOrganizationAdmin();
  if (!UUID.test(websiteId)) return { error: NOT_FOUND };
  const result = await guarded(async () => ({ queued: await retryFailedWebsitePages(member.organizationId, websiteId) }));
  if ("error" in result) return result;
  revalidatePath("/knowledge");
  return { error: null, queued: result.queued };
}

/** ADMIN-only. Looks for pages again and adds the new ones. */
export async function refreshWebsitePagesAction(websiteId: string): Promise<WebsiteActionResult<{ added: number }>> {
  const member = await requireOrganizationAdmin();
  if (!UUID.test(websiteId)) return { error: NOT_FOUND };
  const result = await guarded(() => refreshWebsitePages(member.organizationId, websiteId));
  if ("error" in result) return result;
  revalidatePath("/knowledge");
  return { error: null, added: result.added };
}

/** ADMIN-only. Adds one page of the site by address. */
export async function addWebsitePageAction(websiteId: string, url: string): Promise<WebsiteActionResult> {
  const member = await requireOrganizationAdmin();
  if (!UUID.test(websiteId)) return { error: NOT_FOUND };
  const result = await guarded(async () => {
    await addWebsitePage(member.organizationId, websiteId, url);
    return {};
  });
  if ("error" in result) return result;
  revalidatePath("/knowledge");
  return { error: null };
}

export interface WebsiteSettingsState {
  error: string | null;
  saved: boolean;
}

/** ADMIN-only. Saves the publication data used for the pages indexed from now on. */
export async function updateWebsiteSettingsAction(
  websiteId: string,
  _previous: WebsiteSettingsState,
  formData: FormData,
): Promise<WebsiteSettingsState> {
  const member = await requireOrganizationAdmin();
  if (!UUID.test(websiteId)) return { error: NOT_FOUND, saved: false };
  const fields = parseVersionFields(formData);
  if (!fields.ok) return { error: fields.error, saved: false };

  const result = await guarded(async () => {
    await updateWebsiteOptions(member.organizationId, websiteId, {
      version: fields.value.version,
      status: fields.value.status,
      effectiveFrom: fields.value.effectiveFrom,
      effectiveUntil: fields.value.effectiveUntil,
      sourceNote: fields.value.sourceNote,
      jurisdiction: optionalText(formData, "jurisdiction"),
      territory: optionalText(formData, "territory"),
      scope: optionalText(formData, "scope"),
    });
    return {};
  });
  if ("error" in result) return { error: result.error, saved: false };
  revalidatePath("/knowledge");
  return { error: null, saved: true };
}

/** ADMIN-only. Re-embeds the website's documents with the active provider. */
export async function reindexWebsiteAction(
  websiteId: string,
): Promise<WebsiteActionResult<{ documents: number; reembedded: number }>> {
  const member = await requireOrganizationAdmin();
  if (!UUID.test(websiteId)) return { error: NOT_FOUND };
  const result = await guarded(() => reindexWebsiteDocuments(member.organizationId, websiteId));
  if ("error" in result) return result;
  revalidatePath("/knowledge");
  return { error: null, ...result };
}

/** ADMIN-only. Removes the website, and with `deleteDocuments` the documents indexed from it. */
export async function deleteWebsiteAction(
  websiteId: string,
  deleteDocuments: boolean,
): Promise<WebsiteActionResult<{ deletedDocuments: number }>> {
  const member = await requireOrganizationAdmin();
  if (!UUID.test(websiteId)) return { error: NOT_FOUND };
  const result = await guarded(() => deleteWebsite(member.organizationId, websiteId, { deleteDocuments }));
  if ("error" in result) return result;
  revalidatePath("/knowledge");
  return { error: null, deletedDocuments: result.deletedDocuments };
}
