"use client";

import { useState } from "react";
import { Paperclip } from "lucide-react";
import { ATTACHMENT_KIND_LABELS } from "@/modules/messaging/attachments";
import type { ThreadAttachment } from "@/modules/conversations/service";

/**
 * The file a message carries (UI-10c). Kindly keeps no copy: "Descargar" asks
 * the proxy to stream it from the provider to this browser. A refusal
 * (expired, too many downloads, no access) is shown here instead of
 * downloading an error page.
 */
export function AttachmentChip({
  attachment,
  conversationId,
  messageId,
}: {
  attachment: ThreadAttachment;
  conversationId: string;
  messageId: string;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const label = ATTACHMENT_KIND_LABELS[attachment.kind];

  async function download() {
    setBusy(true);
    setError(null);
    try {
      const response = await fetch(`/api/conversations/${conversationId}/messages/${messageId}/media`);
      if (!response.ok) {
        const body = (await response.json().catch(() => null)) as { message?: string } | null;
        setError(body?.message ?? "No se pudo descargar el archivo.");
        return;
      }
      const disposition = response.headers.get("content-disposition") ?? "";
      const encoded = disposition.match(/filename\*=UTF-8''([^;]+)/i)?.[1];
      const name = encoded ? decodeURIComponent(encoded) : (attachment.filename ?? label.toLowerCase());
      const url = URL.createObjectURL(await response.blob());
      const link = document.createElement("a");
      link.href = url;
      link.download = name;
      link.click();
      URL.revokeObjectURL(url);
    } catch {
      setError("No se pudo descargar el archivo.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mt-1.5 flex flex-col gap-0.5 rounded-md border border-border bg-background px-2.5 py-2 text-foreground">
      <p className="flex items-center gap-1.5 type-label font-medium [overflow-wrap:anywhere]">
        <Paperclip className="size-3.5 shrink-0" aria-hidden />
        {attachment.filename ? `${label}: ${attachment.filename}` : label}
      </p>
      <p className="type-caption text-foreground-lighter">
        Archivo no guardado en Kindly ·{" "}
        {attachment.downloadable ? (
          <button
            type="button"
            onClick={download}
            disabled={busy}
            className="focus-ring rounded-sm text-primary underline disabled:opacity-60"
          >
            {busy ? "Descargando…" : "Descargar"}
          </button>
        ) : (
          <span>ya no está disponible en el proveedor</span>
        )}
      </p>
      {error && (
        <p role="alert" className="type-caption text-destructive">
          {error}
        </p>
      )}
    </div>
  );
}
