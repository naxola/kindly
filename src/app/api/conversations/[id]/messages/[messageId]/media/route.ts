import { getCurrentOrganizationMember } from "@/modules/organizations/service";
import { getMessageForMediaDownload } from "@/modules/conversations/service";
import { getMessagingAdapter } from "@/modules/messaging/registry";
import {
  isMediaExpired,
  MEDIA_DOWNLOADS_PER_MINUTE,
  safeContentType,
  safeDownloadName,
} from "@/modules/messaging/attachments";
import { countRecentActivities, recordActivity } from "@/modules/audit/service";

/**
 * Download of the file a message carries (UI-10c, `docs/ui/CONVERSATION_WORKSPACE.md`
 * §5.2). **A pass-through proxy**: the provider's bytes go straight to the
 * member's browser as a stream — never to disk, storage, a log or a cache
 * (`Cache-Control: no-store`). Kindly keeps no copy of the file.
 *
 * Access is the ficha's own rule: a message outside the organization is 404,
 * one in a conversation the member may not see is 403 (PKG-014). A member can
 * start a limited number of downloads per minute, counted from the activity
 * log that also records each one.
 */
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * By name, not `instanceof`: under Turbopack's production output each chunk
 * gets its own instance of a module, so the class thrown by the adapter is not
 * the one imported here (`embedding-provider.ts` documents the same quirk).
 */
const isNamed = (error: unknown, name: string) => error instanceof Error && error.name === name;

const json = (status: number, error: string, message: string, headers?: Record<string, string>) =>
  Response.json({ error, message }, { status, headers: { "Cache-Control": "no-store", ...headers } });

export async function GET(_request: Request, { params }: { params: Promise<{ id: string; messageId: string }> }) {
  const member = await getCurrentOrganizationMember();
  if (!member) {
    return new Response(null, { status: 401 });
  }
  const { id, messageId } = await params;
  if (!UUID.test(id) || !UUID.test(messageId)) {
    return json(404, "NOT_FOUND", "Archivo no encontrado.");
  }

  const found = await getMessageForMediaDownload(member.organizationId, member, id, messageId);
  if (found.status === "NOT_FOUND") return json(404, "NOT_FOUND", "Archivo no encontrado.");
  if (found.status === "FORBIDDEN") return json(403, "FORBIDDEN", "No tienes acceso a esta conversación.");

  const { message, conversation, account } = found;
  const adapter = getMessagingAdapter(conversation.channel);
  if (!adapter?.downloadMedia) {
    return json(410, "UNAVAILABLE", "Este canal no permite descargar archivos.");
  }
  if (isMediaExpired(message.createdAt, adapter.capabilities.inboundMediaDays)) {
    return json(410, "EXPIRED", "El archivo ya no está disponible en el proveedor.");
  }

  const recent = await countRecentActivities(member.organizationId, member.userId, "MESSAGE_MEDIA_DOWNLOADED", 60_000);
  if (recent >= MEDIA_DOWNLOADS_PER_MINUTE) {
    return json(429, "RATE_LIMITED", "Demasiadas descargas seguidas. Espera un momento.", { "Retry-After": "60" });
  }
  await recordActivity({
    organizationId: member.organizationId,
    type: "MESSAGE_MEDIA_DOWNLOADED",
    actorUserId: member.userId,
    entityType: "conversation",
    entityId: conversation.id,
    metadata: { messageId: message.id, kind: message.attachment.kind },
  });

  let media;
  try {
    media = await adapter.downloadMedia(account, message.attachment);
  } catch (error) {
    if (isNamed(error, "MediaUnavailableError")) {
      return json(410, "EXPIRED", "El archivo ya no está disponible en el proveedor.");
    }
    if (isNamed(error, "MediaTooLargeError")) {
      return json(413, "TOO_LARGE", "El archivo es demasiado grande para descargarlo desde aquí.");
    }
    // Name only: a provider error message can carry request details.
    console.error("[media] download failed:", error instanceof Error ? error.name : "unknown error");
    return json(502, "PROVIDER_ERROR", "No se pudo obtener el archivo del proveedor. Inténtalo de nuevo.");
  }

  const name = safeDownloadName({ ...message.attachment, mimeType: media.contentType ?? message.attachment.mimeType });
  const asciiName = name.replace(/[^\x20-\x7e]/g, "_");
  const headers: Record<string, string> = {
    "Content-Type": safeContentType(media.contentType ?? message.attachment.mimeType),
    "Content-Disposition": `attachment; filename="${asciiName}"; filename*=UTF-8''${encodeURIComponent(name)}`,
    "Cache-Control": "no-store, private",
    "X-Content-Type-Options": "nosniff",
    "Content-Security-Policy": "default-src 'none'; sandbox",
  };
  if (media.contentLength !== null) headers["Content-Length"] = String(media.contentLength);
  return new Response(media.body, { status: 200, headers });
}
