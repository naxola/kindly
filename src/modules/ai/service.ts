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
import { and, desc, eq, lt } from "drizzle-orm";
import { db } from "@/db/client";
import { aiSuggestions, type AIContextSnapshot } from "@/modules/ai/schema";
import {
  COPILOT_SYSTEM_PROMPT,
  SUGGESTION_JSON_SCHEMA,
  SUGGESTION_SCHEMA_NAME,
  buildCopilotUserPrompt,
  parseRawSuggestion,
  reconcileSuggestion,
  toAISource,
  type AISuggestion,
  type CopilotContext,
} from "@/modules/ai/domain";
import { getLLMProvider } from "@/modules/ai/llm-provider";
import { recordActivity } from "@/modules/audit/service";
import { getConversationWithDetails, listMessages } from "@/modules/conversations/service";
import { listCasesForContact } from "@/modules/cases/service";
import { listTasksForContact } from "@/modules/tasks/service";
import { retrieveKnowledge } from "@/modules/knowledge/retrieval";
import type { VisibilityMember } from "@/modules/contacts/visibility";

/** Explicit retention of the audit snapshot (it contains the prompt: personal data). */
export const RETENTION_DAYS = 90;
const CONTEXT_MESSAGE_LIMIT = 20;
const KNOWLEDGE_LIMIT = 5;
const CLOSED_CASE_STATUSES = ["RESOLVED", "CLOSED"];

export type AISuggestionRow = typeof aiSuggestions.$inferSelect;

export class CopilotError extends Error {
  constructor(
    readonly code: "NOT_FOUND" | "NOTHING_TO_ANSWER" | "GENERATION_FAILED" | "ALREADY_RESOLVED",
    message: string,
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
}

/**
 * Generates a suggestion for the Conversation's latest inbound message.
 * Visibility is the Conversation's own (`getConversationWithDetails`): a
 * DELEGATE with no access gets NOT_FOUND. A failure is recorded as a FAILED
 * row (so the attempt is auditable) and surfaced as `GENERATION_FAILED`.
 */
export async function generateSuggestion(input: GenerateSuggestionInput): Promise<AISuggestionRow> {
  const { organizationId, member, conversationId } = input;

  const details = await getConversationWithDetails(organizationId, member, conversationId);
  if (!details) {
    throw new CopilotError("NOT_FOUND", "Conversation not found.");
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

  // Knowledge is optional: without an embedding provider the copilot still
  // works on the conversation alone, and without sources it can only reach
  // INSUFFICIENT (reconcileSuggestion).
  let knowledgeAvailable = true;
  let knowledge: CopilotContext["knowledge"] = [];
  try {
    const results = await retrieveKnowledge({
      organizationId,
      query: lastInbound.body,
      limit: KNOWLEDGE_LIMIT,
    });
    knowledge = results.map(toAISource);
  } catch {
    knowledgeAvailable = false;
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
    knowledgeAvailable,
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
    );
  } catch (error) {
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
  suggestionId: string;
  action: "USED_AS_DRAFT" | "DISCARDED";
}): Promise<AISuggestionRow> {
  const { organizationId, member, suggestionId, action } = input;

  const [existing] = await db
    .select()
    .from(aiSuggestions)
    .where(and(eq(aiSuggestions.organizationId, organizationId), eq(aiSuggestions.id, suggestionId)))
    .limit(1);
  if (!existing) {
    throw new CopilotError("NOT_FOUND", "Suggestion not found.");
  }
  const details = await getConversationWithDetails(organizationId, member, existing.conversationId);
  if (!details) {
    throw new CopilotError("NOT_FOUND", "Suggestion not found.");
  }
  if (existing.status !== "GENERATED") {
    throw new CopilotError("ALREADY_RESOLVED", "The suggestion was already resolved or failed.");
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
