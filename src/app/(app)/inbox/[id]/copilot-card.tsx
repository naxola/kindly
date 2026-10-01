"use client";

import { useState } from "react";
import Link from "next/link";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ChevronDown, ChevronRight, Sparkles } from "lucide-react";
import type { CopilotSourceDto, CopilotSuggestionDto } from "@/modules/ai/dto";
import type { DocumentVersionStatus } from "@/modules/knowledge/schema";
import { Alert } from "@/components/ui/alert";
import { Badge, type BadgeProps } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { Skeleton } from "@/components/ui/primitives";
import { toast } from "@/components/ui/toast";
import { retryUnlessClientError } from "@/app/(app)/inbox/inbox-queries";
import {
  CopilotApiError,
  copilotKeys,
  fetchSuggestion,
  generateSuggestion,
  resolveSuggestion,
} from "@/app/(app)/inbox/[id]/copilot-api";
import { VERSION_STATUS_LABELS, VERSION_STATUS_TONES, formatVigencia } from "@/app/(app)/knowledge/labels";
import { cn } from "@/lib/cn";

const EVIDENCE: Record<"SUFFICIENT" | "PARTIAL" | "INSUFFICIENT", { label: string; tone: NonNullable<BadgeProps["tone"]> }> = {
  SUFFICIENT: { label: "Evidencia suficiente", tone: "success" },
  PARTIAL: { label: "Evidencia parcial", tone: "warning" },
  INSUFFICIENT: { label: "Evidencia insuficiente", tone: "destructive" },
};

/**
 * The Copilot card (Fase 8, docs/ui/CONVERSATION_WORKSPACE.md §4): between
 * the history and the composer, on request. It talks only to the Copilot API
 * (`copilot-api.ts`) and renders the DTO — it knows nothing about the model.
 *
 * It never sends: "Usar como borrador" hands the text to the composer
 * (`onUseAsDraft`) and the professional edits and presses Send themselves.
 * When the copilot abstains there is no draft and no such button, only what
 * is missing.
 */
export function CopilotCard({
  conversationId,
  latestInboundId,
  composerAvailable,
  composerUnavailableReason,
  hasDraftText,
  onUseAsDraft,
}: {
  conversationId: string;
  /** Latest inbound message currently in the thread (live, polled by the thread). */
  latestInboundId: string | null;
  /** False when the composer is hidden (closed service window): the draft cannot be used. */
  composerAvailable: boolean;
  composerUnavailableReason: string;
  /** The composer already has text: using the draft asks before replacing it. */
  hasDraftText: boolean;
  onUseAsDraft: (text: string) => void;
}) {
  const queryClient = useQueryClient();
  const key = copilotKeys.conversation(conversationId);
  const [collapsed, setCollapsed] = useState(false);
  const [confirmReplace, setConfirmReplace] = useState<CopilotSuggestionDto | null>(null);

  const query = useQuery({
    queryKey: key,
    queryFn: () => fetchSuggestion(conversationId),
    retry: retryUnlessClientError,
    refetchOnWindowFocus: false,
  });

  const generate = useMutation({
    mutationFn: () => generateSuggestion(conversationId),
    onSuccess: (suggestion) => queryClient.setQueryData(key, suggestion),
  });

  const resolve = useMutation({
    mutationFn: (input: { suggestionId: string; action: "USED_AS_DRAFT" | "DISCARDED" }) =>
      resolveSuggestion(conversationId, input.suggestionId, input.action),
    onSuccess: (suggestion) => queryClient.setQueryData(key, suggestion),
    onError: (error) => toast.error(error instanceof CopilotApiError ? error.userMessage : "No se pudo registrar la acción."),
  });

  const suggestion = query.data ?? null;
  const open = suggestion?.status === "GENERATED" ? suggestion : null;
  const hasNewerMessage = open !== null && latestInboundId !== null && latestInboundId !== open.triggerMessageId;
  const noInbound = latestInboundId === null;

  function applyDraft(target: CopilotSuggestionDto) {
    onUseAsDraft(target.suggestedReply);
    resolve.mutate({ suggestionId: target.id, action: "USED_AS_DRAFT" });
  }

  function requestUseDraft(target: CopilotSuggestionDto) {
    if (hasDraftText) {
      setConfirmReplace(target);
    } else {
      applyDraft(target);
    }
  }

  const generating = generate.isPending;
  const generateError = generate.error instanceof CopilotApiError ? generate.error : generate.error ? new CopilotApiError(0, "NETWORK", "No se pudo conectar. Inténtalo de nuevo.") : null;

  return (
    <section
      aria-label="Copiloto"
      className="flex max-h-[45dvh] flex-col gap-2 overflow-y-auto border-t border-border bg-background-muted px-4 py-3"
    >
      <header className="flex items-center justify-between gap-2">
        <button
          type="button"
          onClick={() => setCollapsed((value) => !value)}
          aria-expanded={!collapsed}
          className="focus-ring flex items-center gap-1.5 rounded-sm type-body font-semibold text-foreground"
        >
          {collapsed ? <ChevronRight aria-hidden className="size-4" /> : <ChevronDown aria-hidden className="size-4" />}
          <Sparkles aria-hidden className="size-4" />
          Copiloto
        </button>
        {open && !collapsed && <EvidenceBadge suggestion={open} />}
        {collapsed && open && <span className="type-caption text-foreground-lighter">{summaryLine(open)}</span>}
      </header>

      {!collapsed && (
        <div className="flex flex-col gap-2">
          {query.isPending ? (
            <Skeleton className="h-10 w-full" />
          ) : query.isError ? (
            <Alert tone="neutral" title="No se pudo cargar el copiloto" actions={<Button size="sm" variant="outline" onClick={() => void query.refetch()}>Reintentar</Button>} />
          ) : generating ? (
            <p role="status" className="type-body text-foreground-light">
              Analizando la conversación…
            </p>
          ) : open ? (
            <OpenSuggestion
              suggestion={open}
              hasNewerMessage={hasNewerMessage}
              composerAvailable={composerAvailable}
              composerUnavailableReason={composerUnavailableReason}
              busy={resolve.isPending}
              onUse={() => requestUseDraft(open)}
              onDiscard={() => resolve.mutate({ suggestionId: open.id, action: "DISCARDED" })}
              onRegenerate={() => generate.mutate()}
            />
          ) : (
            <Idle
              suggestion={suggestion}
              disabledReason={noInbound ? "No hay ningún mensaje de la persona al que responder." : undefined}
              onGenerate={() => generate.mutate()}
            />
          )}

          {generateError && !generating && (
            <Alert
              tone="destructive"
              live
              title={generateError.userMessage}
              actions={
                generateError.code === "NOT_AVAILABLE" ? undefined : (
                  <Button size="sm" variant="outline" onClick={() => generate.mutate()}>
                    Reintentar
                  </Button>
                )
              }
            />
          )}

          <p className="type-caption text-foreground-lighter">Nada se envía sin que lo revises tú.</p>
        </div>
      )}

      <ConfirmDialog
        open={confirmReplace !== null}
        onOpenChange={(value) => !value && setConfirmReplace(null)}
        title="Reemplazar el borrador actual"
        description="Ya hay texto en el cuadro de respuesta. Usar la sugerencia lo sustituirá."
        confirmLabel="Reemplazar"
        onConfirm={() => {
          if (confirmReplace) applyDraft(confirmReplace);
          setConfirmReplace(null);
        }}
      />
    </section>
  );
}

function summaryLine(suggestion: CopilotSuggestionDto): string {
  if (suggestion.outcome === "ABSTAINED") return "Sin evidencia suficiente";
  if (suggestion.evidenceLevel) return EVIDENCE[suggestion.evidenceLevel].label;
  return "Sugerencia lista";
}

function EvidenceBadge({ suggestion }: { suggestion: CopilotSuggestionDto }) {
  if (suggestion.outcome === "NO_KNOWLEDGE_NEEDED") {
    return <Badge tone="neutral">No requiere normativa</Badge>;
  }
  const level = EVIDENCE[suggestion.evidenceLevel ?? "INSUFFICIENT"];
  return (
    <Badge tone={level.tone} dot>
      {level.label}
    </Badge>
  );
}

function Idle({
  suggestion,
  disabledReason,
  onGenerate,
}: {
  suggestion: CopilotSuggestionDto | null;
  disabledReason?: string;
  onGenerate: () => void;
}) {
  const message =
    suggestion === null
      ? "Pide una sugerencia para la última intervención de la persona."
      : suggestion.status === "USED_AS_DRAFT"
        ? "La última sugerencia se usó como borrador."
        : suggestion.status === "DISCARDED"
          ? "La última sugerencia se descartó."
          : "No se pudo generar la última sugerencia.";
  return (
    <div className="flex flex-wrap items-center justify-between gap-2">
      <p className="type-body text-foreground-light">{message}</p>
      <Button
        size="sm"
        variant="outline"
        onClick={onGenerate}
        disabled={disabledReason !== undefined}
        disabledReason={disabledReason}
        icon={<Sparkles className="size-4" />}
      >
        {suggestion === null ? "Sugerir respuesta" : "Sugerir de nuevo"}
      </Button>
    </div>
  );
}

function OpenSuggestion({
  suggestion,
  hasNewerMessage,
  composerAvailable,
  composerUnavailableReason,
  busy,
  onUse,
  onDiscard,
  onRegenerate,
}: {
  suggestion: CopilotSuggestionDto;
  hasNewerMessage: boolean;
  composerAvailable: boolean;
  composerUnavailableReason: string;
  busy: boolean;
  onUse: () => void;
  onDiscard: () => void;
  onRegenerate: () => void;
}) {
  const abstained = suggestion.outcome === "ABSTAINED";
  return (
    <div className="flex flex-col gap-2">
      {hasNewerMessage && (
        <Alert
          tone="info"
          title="Ha llegado un mensaje nuevo desde esta sugerencia"
          actions={
            <Button size="sm" variant="outline" onClick={onRegenerate}>
              Actualizar sugerencia
            </Button>
          }
        />
      )}

      {suggestion.issue && (
        <p className="type-body text-foreground-light">
          <span className="font-semibold text-foreground">Qué plantea: </span>
          {suggestion.issue}
        </p>
      )}

      {suggestion.knowledgeStatus === "NOT_CONFIGURED" && (
        <p className="type-caption text-foreground-lighter">
          La base de conocimiento no está disponible aquí: la sugerencia solo usa la conversación.
        </p>
      )}

      {abstained ? (
        <Alert tone="destructive" title="No hay evidencia suficiente para proponer una respuesta">
          <p>No se ha generado ningún borrador. Esto es lo que falta:</p>
          <ul className="list-disc pl-5">
            {suggestion.missingInformation.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
        </Alert>
      ) : (
        <>
          <blockquote className="whitespace-pre-wrap rounded-control border border-border bg-surface-100 px-3 py-2 font-document type-body text-foreground">
            {suggestion.suggestedReply}
          </blockquote>
          {suggestion.missingInformation.length > 0 && (
            <div className="type-body text-foreground-light">
              <p className="font-semibold text-foreground">Falta por saber</p>
              <ul className="list-disc pl-5">
                {suggestion.missingInformation.map((item) => (
                  <li key={item}>{item}</li>
                ))}
              </ul>
            </div>
          )}
        </>
      )}

      {suggestion.warnings.length > 0 && (
        <Alert tone="warning" title="Avisos">
          <ul className="list-disc pl-5">
            {suggestion.warnings.map((warning) => (
              <li key={warning}>{warning}</li>
            ))}
          </ul>
        </Alert>
      )}

      {suggestion.sources.length > 0 && (
        <div className="flex flex-col gap-1">
          <p className="type-body font-semibold text-foreground">Fuentes utilizadas</p>
          <ul className="flex flex-col gap-1">
            {suggestion.sources.map((source) => (
              <li key={source.chunkId}>
                <SourceItem source={source} />
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="flex flex-wrap items-center gap-2">
        {!abstained && (
          <Button
            size="sm"
            onClick={onUse}
            loading={busy}
            disabled={!composerAvailable}
            disabledReason={composerAvailable ? undefined : composerUnavailableReason}
          >
            Usar como borrador
          </Button>
        )}
        <Button size="sm" variant="ghost" onClick={onDiscard} disabled={busy}>
          Descartar
        </Button>
        {abstained && (
          <Button size="sm" variant="outline" onClick={onRegenerate} disabled={busy}>
            Sugerir de nuevo
          </Button>
        )}
      </div>
    </div>
  );
}

function SourceItem({ source }: { source: CopilotSourceDto }) {
  const status = source.status as DocumentVersionStatus;
  return (
    <details className={cn("group rounded-control border border-border bg-surface-100 px-3 py-2")}>
      <summary className="focus-ring flex cursor-pointer list-none flex-wrap items-center gap-2 rounded-sm type-body">
        <ChevronRight aria-hidden className="size-4 shrink-0 text-foreground-lighter group-open:rotate-90" />
        <span className="font-medium text-foreground">{source.documentTitle}</span>
        {source.label && <span className="text-foreground-light">{source.label}</span>}
        <Badge tone={VERSION_STATUS_TONES[status] ?? "neutral"}>{VERSION_STATUS_LABELS[status] ?? source.status}</Badge>
      </summary>
      <div className="mt-2 flex flex-col gap-1">
        <p className="type-caption text-foreground-lighter">
          Versión {source.version} · {formatVigencia(source.validFrom, source.validUntil)}
          {source.sourceNote ? ` · ${source.sourceNote}` : ""}
        </p>
        {source.location && <p className="type-caption text-foreground-lighter">{source.location}</p>}
        <blockquote className="whitespace-pre-line type-body text-foreground">{source.content}</blockquote>
        <Link href={`/knowledge/${source.documentId}`} className="focus-ring w-fit rounded-sm type-body text-foreground-light underline">
          Abrir el documento
        </Link>
      </div>
    </details>
  );
}
