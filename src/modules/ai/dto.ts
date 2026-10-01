/**
 * What the UI is allowed to know about a suggestion. The Copilot API returns
 * only this: no provider, model, prompt, context snapshot or retrieval trace,
 * so swapping the model never touches the UI (Fase 8).
 */
import type { AISource, AISuggestion, EvidenceLevel, KnowledgeStatus, SuggestionOutcome } from "@/modules/ai/domain";
import type { AISuggestionStatus } from "@/modules/ai/schema";

export interface CopilotSourceDto {
  chunkId: string;
  documentId: string;
  documentVersionId: string;
  documentTitle: string;
  version: string;
  status: string;
  validFrom: string;
  validUntil: string | null;
  sourceNote: string | null;
  /** Hierarchical location, e.g. "Título I > Artículo 34", when the chunk has one. */
  location: string | null;
  label: string | null;
  content: string;
}

export interface CopilotSuggestionDto {
  id: string;
  status: AISuggestionStatus;
  createdAt: string;
  resolvedAt: string | null;
  /** The inbound message this suggestion answers. */
  triggerMessageId: string | null;
  /** True when an inbound message arrived after the one this suggestion answers. */
  hasNewerMessage: boolean;
  /** Present unless the generation failed. */
  outcome: SuggestionOutcome | null;
  knowledgeStatus: KnowledgeStatus | null;
  issue: string | null;
  /** Empty when the copilot abstained. */
  suggestedReply: string;
  evidenceLevel: EvidenceLevel | null;
  sources: CopilotSourceDto[];
  warnings: string[];
  missingInformation: string[];
}

export interface CopilotStateDto {
  suggestion: CopilotSuggestionDto | null;
}

export function toSourceDto(source: AISource): CopilotSourceDto {
  return {
    chunkId: source.chunkId,
    documentId: source.documentId,
    documentVersionId: source.documentVersionId,
    documentTitle: source.documentTitle,
    version: source.version,
    status: source.status,
    validFrom: source.effectiveFrom,
    validUntil: source.effectiveUntil,
    sourceNote: source.sourceNote,
    location: source.path,
    label: source.label,
    content: source.content,
  };
}

export function toSuggestionDto(
  row: {
    id: string;
    status: AISuggestionStatus;
    createdAt: Date;
    resolvedAt: Date | null;
    triggerMessageId: string | null;
    suggestion: unknown;
  },
  latestInboundMessageId: string | null,
): CopilotSuggestionDto {
  const suggestion = row.suggestion as AISuggestion | null;
  return {
    id: row.id,
    status: row.status,
    createdAt: row.createdAt.toISOString(),
    resolvedAt: row.resolvedAt?.toISOString() ?? null,
    triggerMessageId: row.triggerMessageId,
    hasNewerMessage: latestInboundMessageId !== null && latestInboundMessageId !== row.triggerMessageId,
    outcome: suggestion?.outcome ?? null,
    knowledgeStatus: suggestion?.knowledgeStatus ?? null,
    issue: suggestion?.issue ?? null,
    suggestedReply: suggestion?.suggestedReply ?? "",
    evidenceLevel: suggestion?.evidenceLevel ?? null,
    sources: (suggestion?.sources ?? []).map(toSourceDto),
    warnings: suggestion?.warnings ?? [],
    missingInformation: suggestion?.missingInformation ?? [],
  };
}
