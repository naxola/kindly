/**
 * AI Copilot service (Fase 8): builds a bounded context for a Conversation,
 * retrieves real knowledge under the hard filters of Fase 7c, asks the
 * `LLMProvider` for a structured suggestion, reconciles it (`domain.ts`) and
 * records the whole round trip in `ai_suggestions`.
 *
 * The copilot never sends: this module has no write path to `messages`. The
 * only way a suggestion reaches a Contact is the professional pressing Send
 * in the composer after "Usar como borrador" (`CLAUDE.md` §2.2).
 */
import "server-only";
import { and, desc, eq, isNull, lt } from "drizzle-orm";
import { db } from "@/db/client";
import { aiSuggestions, type AIContextSnapshot } from "@/modules/ai/schema";
import { messages } from "@/modules/conversations/schema";
import {
  COPILOT_SYSTEM_PROMPT,
  SUGGESTION_JSON_SCHEMA,
  SUGGESTION_SCHEMA_NAME,
  buildCopilotUserPrompt,
  buildRetrievalQuery,
  isRelevantCandidate,
  parseRawSuggestion,
  reconcileSuggestion,
  toAISource,
  type AISuggestion,
  type CopilotContext,
  type KnowledgeStatus,
} from "@/modules/ai/domain";
import { getMinSimilarity } from "@/modules/ai/config";
import { getLLMProvider, hasLLMProvider } from "@/modules/ai/llm-provider";
import { recordActivity } from "@/modules/audit/service";
import { getConversationWithDetails, listMessages } from "@/modules/conversations/service";
import { listCasesForContact } from "@/modules/cases/service";
import { listTasksForContact } from "@/modules/tasks/service";
import { retrieveKnowledge } from "@/modules/knowledge/retrieval";
import { getReranker } from "@/modules/knowledge/reranker";
import { EmbeddingProviderNotConfiguredError } from "@/modules/knowledge/embedding-provider";
import type { VisibilityMember } from "@/modules/contacts/visibility";

/** Explicit retention of the audit snapshot (it contains the prompt: personal data). */
export const RETENTION_DAYS = 90;
const CONTEXT_MESSAGE_LIMIT = 20;
/** Candidates fetched from retrieval, before the relevance gate. */
const CANDIDATE_LIMIT = 8;
/** Fragments offered to the model after gate and reranker. */
const KNOWLEDGE_LIMIT = 5;
/** Minimum time between two generations for the same conversation (cost control; also stops double clicks). */
export const GENERATION_COOLDOWN_SECONDS = 10;
const CLOSED_CASE_STATUSES = ["RESOLVED", "CLOSED"];

export type AISuggestionRow = typeof aiSuggestions.$inferSelect;

export class CopilotError extends Error {
  constructor(
    readonly code:
      | "NOT_FOUND"
      | "NOT_AVAILABLE"
      | "NOTHING_TO_ANSWER"
      | "NOTHING_TO_USE"
      | "RATE_LIMITED"
      | "GENERATION_FAILED"
      | "ALREADY_RESOLVED",
    message: string,
    /** For RATE_LIMITED: seconds until the next generation is allowed. */
    readonly retryAfterSeconds?: number,
  ) {
    super(message);
  }
}

function retentionDeadline(from: Date): Date {
  return new Date(from.getTime() + RETENTION_DAYS * 24 * 60 * 60 * 1000);
}

export interface GenerateSuggestionInput {
  organizationId: string;
  member: VisibilityMember;
  conversationId: string;
  /** Override the per-conversation cooldown (tests only; callers never pass it). */
  cooldownSeconds?: number;
}

/**
 * Generates a suggestion for the Conversation's latest inbound message.
 * Visibility is the Conversation's own (`getConversationWithDetails`): a
 * DELEGATE with no access gets NOT_FOUND. A failure is recorded as a FAILED
 * row (so the attempt is auditable) and surfaced as `GENERATION_FAILED`.
 */
export async function generateSuggestion(input: GenerateSuggestionInput): Promise<AISuggestionRow> {
  const { organizationId, member, conversationId } = input;

  if (!hasLLMProvider()) {
    throw new CopilotError("NOT_AVAILABLE", "The copilot is not configured in this environment.");
  }

  const details = await getConversationWithDetails(organizationId, member, conversationId);
  if (!details) {
    throw new CopilotError("NOT_FOUND", "Conversation not found.");
  }

  // Cooldown: any attempt (including a failed one) counts, so a failing
  // provider cannot be hammered either.
  const cooldown = input.cooldownSeconds ?? GENERATION_COOLDOWN_SECONDS;
  const [previous] = await db
    .select({ createdAt: aiSuggestions.createdAt })
    .from(aiSuggestions)
    .where(and(eq(aiSuggestions.organizationId, organizationId), eq(aiSuggestions.conversationId, conversationId)))
    .orderBy(desc(aiSuggestions.createdAt))
    .limit(1);
  if (previous) {
    const elapsed = (Date.now() - previous.createdAt.getTime()) / 1000;
    if (elapsed < cooldown) {
      throw new CopilotError("RATE_LIMITED", "Too many suggestion requests.", Math.ceil(cooldown - elapsed));
    }
  }

  const allMessages = (await listMessages(organizationId, conversationId)).filter((m) => !m.deletedAt);
  const recent = allMessages.slice(-CONTEXT_MESSAGE_LIMIT);
  const lastInbound = [...recent].reverse().find((m) => m.direction === "INBOUND");
  if (!lastInbound) {
    throw new CopilotError("NOTHING_TO_ANSWER", "The conversation has no inbound message to answer.");
  }

  const [cases, tasks] = await Promise.all([
    listCasesForContact(organizationId, member, details.contact.id),
    listTasksForContact(organizationId, member, details.contact.id),
  ]);

  // Knowledge is optional. "Not configured" is an expected state; anything
  // else is a real failure and is surfaced (status ERROR, logged without
  // content) instead of being silently treated as "nothing found".
  let knowledgeStatus: KnowledgeStatus = "OK";
  let knowledge: CopilotContext["knowledge"] = [];
  let retrieval: AIContextSnapshot["retrieval"] = null;
  const reranker = getReranker();
  const retrievalQuery = buildRetrievalQuery(recent);
  try {
    const minSimilarity = getMinSimilarity();
    const results = await retrieveKnowledge({
      organizationId,
      query: retrievalQuery,
      limit: CANDIDATE_LIMIT,
    });
    const gated = results.map((r, i) => ({ r, rank: i + 1, passed: isRelevantCandidate(r, minSimilarity) }));
    retrieval = {
      query: retrievalQuery,
      minSimilarity,
      reranker: reranker.id,
      candidates: gated.map(({ r, rank, passed }) => ({
        chunkId: r.chunkId,
        rank,
        ftsMatch: r.ftsMatch,
        similarity: r.similarity,
        passed,
      })),
    };
    const ranked = await reranker.rerank(
      retrievalQuery,
      gated.filter((g) => g.passed).map((g) => g.r),
    );
    knowledge = ranked.slice(0, KNOWLEDGE_LIMIT).map((ranked) => toAISource(ranked.chunk));
  } catch (error) {
    if (error instanceof EmbeddingProviderNotConfiguredError) {
      knowledgeStatus = "NOT_CONFIGURED";
    } else {
      knowledgeStatus = "ERROR";
      // Name only: a database error message can embed the query text (a Contact's message).
      console.error("[copilot] knowledge retrieval failed:", error instanceof Error ? error.name : "unknown error");
    }
  }

  const context: CopilotContext = {
    contactName: details.contact.name,
    contactNotes: details.contact.notes,
    channel: details.conversation.channel,
    messages: recent.map((m) => ({ direction: m.direction, body: m.body, at: m.createdAt })),
    openCases: cases
      .filter((c) => !CLOSED_CASE_STATUSES.includes(c.status))
      .map((c) => ({ title: c.title, status: c.status, description: c.description })),
    pendingTasks: tasks.filter((t) => !t.completedAt).map((t) => ({ title: t.title, dueDate: t.dueDate })),
    knowledge,
  };

  const userPrompt = buildCopilotUserPrompt(context);
  const snapshot: AIContextSnapshot = {
    systemPrompt: COPILOT_SYSTEM_PROMPT,
    userPrompt,
    messageIds: recent.map((m) => m.id),
    retrievedChunkIds: knowledge.map((k) => k.chunkId),
    knowledgeStatus,
    retrieval,
  };

  const provider = getLLMProvider();
  const now = new Date();
  const base = {
    organizationId,
    conversationId,
    requestedBy: member.userId,
    triggerMessageId: lastInbound.id,
    providerId: provider.id,
    contextSnapshot: snapshot,
    retentionExpiresAt: retentionDeadline(now),
  };

  let suggestion: AISuggestion;
  let model: string;
  try {
    const result = await provider.generateStructured({
      system: COPILOT_SYSTEM_PROMPT,
      user: userPrompt,
      schemaName: SUGGESTION_SCHEMA_NAME,
      jsonSchema: SUGGESTION_JSON_SCHEMA,
    });
    model = result.model;
    suggestion = reconcileSuggestion(
      parseRawSuggestion(result.output),
      knowledge,
      knowledgeStatus,
    );
  } catch (error) {
    // Provider status/message only (the providers never put keys or prompts in them).
    console.error(
      `[copilot] generation failed (provider=${provider.id}):`,
      error instanceof Error ? error.message.slice(0, 300) : "unknown error",
    );
    await db.insert(aiSuggestions).values({
      ...base,
      status: "FAILED",
      errorMessage: error instanceof Error ? error.message.slice(0, 500) : "Unknown error",
    });
    throw new CopilotError("GENERATION_FAILED", "The copilot could not generate a suggestion.");
  }

  const [row] = await db
    .insert(aiSuggestions)
    .values({ ...base, status: "GENERATED", model, suggestion })
    .returning();

  await recordActivity({
    organizationId,
    type: "AI_SUGGESTION_GENERATED",
    actorUserId: member.userId,
    entityType: "ai_suggestion",
    entityId: row.id,
    metadata: { conversationId, evidenceLevel: suggestion.evidenceLevel, sources: suggestion.sources.length },
  });
  return row;
}

/** Latest suggestion of a Conversation the member can see, or null. */
export async function getLatestSuggestion(
  organizationId: string,
  member: VisibilityMember,
  conversationId: string,
): Promise<AISuggestionRow | null> {
  const details = await getConversationWithDetails(organizationId, member, conversationId);
  if (!details) {
    return null;
  }
  const [row] = await db
    .select()
    .from(aiSuggestions)
    .where(and(eq(aiSuggestions.organizationId, organizationId), eq(aiSuggestions.conversationId, conversationId)))
    .orderBy(desc(aiSuggestions.createdAt))
    .limit(1);
  return row ?? null;
}

/**
 * Records what the professional did with a suggestion. `USED_AS_DRAFT`
 * means the text went into the composer — it says nothing about sending
 * (that is the composer's own, separate action).
 */
export async function resolveSuggestion(input: {
  organizationId: string;
  member: VisibilityMember;
  conversationId: string;
  suggestionId: string;
  action: "USED_AS_DRAFT" | "DISCARDED";
}): Promise<AISuggestionRow> {
  const { organizationId, member, conversationId, suggestionId, action } = input;

  const [existing] = await db
    .select()
    .from(aiSuggestions)
    .where(and(eq(aiSuggestions.organizationId, organizationId), eq(aiSuggestions.id, suggestionId)))
    .limit(1);
  if (!existing || existing.conversationId !== conversationId) {
    throw new CopilotError("NOT_FOUND", "Suggestion not found.");
  }
  const details = await getConversationWithDetails(organizationId, member, existing.conversationId);
  if (!details) {
    throw new CopilotError("NOT_FOUND", "Suggestion not found.");
  }
  if (existing.status !== "GENERATED") {
    throw new CopilotError("ALREADY_RESOLVED", "The suggestion was already resolved or failed.");
  }
  if (action === "USED_AS_DRAFT" && !(existing.suggestion as AISuggestion | null)?.suggestedReply) {
    throw new CopilotError("NOTHING_TO_USE", "This suggestion has no reply to use as a draft.");
  }

  const [row] = await db
    .update(aiSuggestions)
    .set({ status: action, resolvedBy: member.userId, resolvedAt: new Date() })
    .where(
      and(
        eq(aiSuggestions.organizationId, organizationId),
        eq(aiSuggestions.id, suggestionId),
        eq(aiSuggestions.status, "GENERATED"),
      ),
    )
    .returning();
  if (!row) {
    throw new CopilotError("ALREADY_RESOLVED", "The suggestion was already resolved or failed.");
  }

  await recordActivity({
    organizationId,
    type: action === "USED_AS_DRAFT" ? "AI_SUGGESTION_USED" : "AI_SUGGESTION_DISCARDED",
    actorUserId: member.userId,
    entityType: "ai_suggestion",
    entityId: row.id,
    metadata: { conversationId: row.conversationId },
  });
  return row;
}

/** Deletes audit rows past their retention deadline; returns how many. Meant for a scheduled job. */
export async function purgeExpiredSuggestions(now: Date = new Date()): Promise<number> {
  const deleted = await db
    .delete(aiSuggestions)
    .where(lt(aiSuggestions.retentionExpiresAt, now))
    .returning({ id: aiSuggestions.id });
  return deleted.length;
}

/** Id of the conversation's latest inbound message, for "a newer message arrived" checks. */
export async function getLatestInboundMessageId(organizationId: string, conversationId: string): Promise<string | null> {
  const [row] = await db
    .select({ id: messages.id })
    .from(messages)
    .where(
      and(
        eq(messages.organizationId, organizationId),
        eq(messages.conversationId, conversationId),
        eq(messages.direction, "INBOUND"),
        isNull(messages.deletedAt),
      ),
    )
    .orderBy(desc(messages.createdAt))
    .limit(1);
  return row?.id ?? null;
}
