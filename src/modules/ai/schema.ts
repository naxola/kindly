/**
 * Drizzle schema for the AI Copilot audit trail (Fase 8, `docs/DATABASE.md`
 * §16/§18): one row per generated suggestion, keeping what the model
 * received (`context_snapshot`), what it returned (`suggestion`) and what the
 * professional did with it (`status`, `resolved_by`, `resolved_at`).
 *
 * The snapshot contains the prompt — personal data of a Contact — so every
 * row carries an explicit `retention_expires_at` (`RETENTION_DAYS` in
 * `service.ts`) and `purgeExpiredSuggestions` deletes what has expired. The
 * suggestion is never sent from here: nothing in this module writes to
 * `messages` (`CLAUDE.md` §2.2).
 */
import { index, jsonb, pgEnum, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { organizations } from "@/modules/organizations/schema";
import { users } from "@/modules/auth/schema";
import { conversations, messages } from "@/modules/conversations/schema";

export const aiSuggestionStatus = pgEnum("ai_suggestion_status", [
  "GENERATED",
  "USED_AS_DRAFT",
  "DISCARDED",
  "FAILED",
]);
export type AISuggestionStatus = (typeof aiSuggestionStatus.enumValues)[number];

export interface AIContextSnapshot {
  /** The system and user prompts exactly as sent to the model. */
  systemPrompt: string;
  userPrompt: string;
  /** Messages included in the context, newest last. */
  messageIds: string[];
  /** Knowledge chunks offered to the model as citable (after the relevance gate and reranker). */
  retrievedChunkIds: string[];
  /** OK, NOT_CONFIGURED (no embedding provider) or ERROR (lookup failed). */
  knowledgeStatus: "OK" | "NOT_CONFIGURED" | "ERROR";
  /** What retrieval did, for evaluation and debugging. */
  retrieval: {
    /** The text actually searched (last inbound message, plus earlier ones when it was short). */
    query: string;
    minSimilarity: number;
    reranker: string;
    candidates: { chunkId: string; rank: number; ftsMatch: boolean; similarity: number | null; passed: boolean }[];
  } | null;
}

export const aiSuggestions = pgTable(
  "ai_suggestions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    conversationId: uuid("conversation_id")
      .notNull()
      .references(() => conversations.id, { onDelete: "cascade" }),
    requestedBy: text("requested_by").references(() => users.id, { onDelete: "set null" }),
    /** The latest inbound message the suggestion answers. */
    triggerMessageId: uuid("trigger_message_id").references(() => messages.id, { onDelete: "set null" }),
    status: aiSuggestionStatus("status").notNull().default("GENERATED"),
    providerId: text("provider_id").notNull(),
    model: text("model"),
    contextSnapshot: jsonb("context_snapshot").$type<AIContextSnapshot>().notNull(),
    /** The reconciled `AISuggestion` (domain.ts); null when generation failed. */
    suggestion: jsonb("suggestion"),
    errorMessage: text("error_message"),
    resolvedBy: text("resolved_by").references(() => users.id, { onDelete: "set null" }),
    resolvedAt: timestamp("resolved_at", { withTimezone: true }),
    retentionExpiresAt: timestamp("retention_expires_at", { withTimezone: true }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("ai_suggestions_conversation_idx").on(table.organizationId, table.conversationId, table.createdAt),
    index("ai_suggestions_retention_idx").on(table.retentionExpiresAt),
  ],
);
