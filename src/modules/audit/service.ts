import "server-only";
import { and, count, desc, eq, gt } from "drizzle-orm";
import { db } from "@/db/client";
import { activities } from "@/modules/audit/schema";

export type ActivityEntityType =
  | "contact"
  | "case"
  | "task"
  | "conversation"
  | "messaging_account"
  | "organization"
  | "procedure"
  | "knowledge_document"
  | "ai_suggestion";

/**
 * Beyond the "tipos mínimos" documented in docs/DATABASE.md sección 12
 * (CASE_CREATED, CASE_ASSIGNED, TASK_CREATED, TASK_COMPLETED,
 * MESSAGE_RECEIVED, MESSAGE_SENT, CHANNEL_CONNECTED, CHANNEL_DISCONNECTED),
 * this adds CONTACT_CREATED/CONTACT_UPDATED and CASE_STATUS_CHANGED
 * (PKG-002), and CONTACT_IDENTIFIED/CONVERSATION_REASSIGNED (PKG-004, the
 * "marcar como identificado"/"reasignar" actions on an Unassigned Contact).
 * PKG-005 adds MESSAGE_SENT_FROM_DEVICE: on a channel with coexistence an
 * outbound message may have been written on the delegate's own phone, with
 * no actor inside Kindly — that is not the same event as MESSAGE_SENT.
 * UI-10c adds MESSAGE_MEDIA_DOWNLOADED (`conversations/service.ts`, the download proxy) —
 * entity `conversation`; it is also what the proxy counts to rate-limit a member.
 * PKG-006 adds MEMBER_INVITED/MEMBER_JOINED/INVITATION_REVOKED, the first
 * activities whose entity is the Organization itself.
 * UI-7 adds MEMBER_ROLE_CHANGED (changing a member's role, ORGANIZATION.md
 * §4) and ORGANIZATION_RENAMED (editing the organization's name). PKG-014
 * adds CONTACT_DELEGATE_ASSIGNED (a Contact's reference delegate changes,
 * `contacts/assignments.ts`) — distinct from CONVERSATION_REASSIGNED
 * (PKG-004), which moves a Conversation to a different Contact.
 * UI-10b adds MEMBERSHIP_CREATED/MEMBERSHIP_UPDATED/MEMBERSHIP_ENDED
 * (`memberships/service.ts`) — entity `contact`, like
 * CONTACT_DELEGATE_ASSIGNED, since a Membership has no page of its own and
 * shows up in the Contact's activity feed.
 * Fase 6 adds CASE_CONVERSATION_LINKED/CASE_CONVERSATION_UNLINKED
 * (`conversations/service.ts::linkConversationToCase`/
 * `unlinkConversationFromCase`) — entity `case`, the Case is the side with
 * its own page and activity feed.
 * Fase 7d adds PROCEDURE_CREATED/PROCEDURE_VERSION_PUBLISHED
 * (`procedures/service.ts`) — entity `procedure`.
 * Fase 7f adds KNOWLEDGE_DOCUMENT_CREATED/KNOWLEDGE_VERSION_PUBLISHED
 * (`knowledge/upload.ts`) — entity `knowledge_document`.
 * UI-10c adds PROCEDURE_STARTED/DOCUMENT_RECEIVED/DOCUMENT_UNMARKED/COMPLETED/
 * CANCELLED (`procedures/applications.ts`) — entity `contact`, whose feed shows them.
 * Fase 8 adds AI_SUGGESTION_GENERATED/USED/DISCARDED (`ai/service.ts`) —
 * entity `ai_suggestion`.
 * The docs call that list "mínimos", not closed.
 */
export type ActivityType =
  | "CONTACT_CREATED"
  | "CONTACT_UPDATED"
  | "CONTACT_IDENTIFIED"
  | "CONTACT_DELEGATE_ASSIGNED"
  | "MEMBERSHIP_CREATED"
  | "MEMBERSHIP_UPDATED"
  | "MEMBERSHIP_ENDED"
  | "CASE_CREATED"
  | "CASE_ASSIGNED"
  | "CASE_STATUS_CHANGED"
  | "CASE_CONVERSATION_LINKED"
  | "CASE_CONVERSATION_UNLINKED"
  | "TASK_CREATED"
  | "TASK_COMPLETED"
  | "MESSAGE_RECEIVED"
  | "MESSAGE_SENT"
  | "MESSAGE_SENT_FROM_DEVICE"
  | "MESSAGE_MEDIA_DOWNLOADED"
  | "CONVERSATION_REASSIGNED"
  | "CHANNEL_CONNECTED"
  | "CHANNEL_DISCONNECTED"
  | "MEMBER_INVITED"
  | "MEMBER_JOINED"
  | "INVITATION_REVOKED"
  | "MEMBER_ROLE_CHANGED"
  | "ORGANIZATION_RENAMED"
  | "PROCEDURE_CREATED"
  | "PROCEDURE_VERSION_PUBLISHED"
  | "PROCEDURE_STARTED"
  | "PROCEDURE_DOCUMENT_RECEIVED"
  | "PROCEDURE_DOCUMENT_UNMARKED"
  | "PROCEDURE_COMPLETED"
  | "PROCEDURE_CANCELLED"
  | "KNOWLEDGE_DOCUMENT_CREATED"
  | "KNOWLEDGE_VERSION_PUBLISHED"
  | "AI_SUGGESTION_GENERATED"
  | "AI_SUGGESTION_USED"
  | "AI_SUGGESTION_DISCARDED";

interface RecordActivityInput {
  organizationId: string;
  type: ActivityType;
  /** Null for system-triggered activity with no human actor — e.g. MESSAGE_RECEIVED from an inbound webhook. */
  actorUserId: string | null;
  entityType: ActivityEntityType;
  entityId: string;
  metadata?: Record<string, unknown>;
}

export async function recordActivity(input: RecordActivityInput) {
  await db.insert(activities).values({
    organizationId: input.organizationId,
    type: input.type,
    actorUserId: input.actorUserId,
    entityType: input.entityType,
    entityId: input.entityId,
    metadata: input.metadata ?? null,
  });
}

/** Read-only activity feed embedded in a Contact/Case detail page. */
export async function listActivitiesForEntity(
  organizationId: string,
  entityType: ActivityEntityType,
  entityId: string,
) {
  return db
    .select()
    .from(activities)
    .where(
      and(
        eq(activities.organizationId, organizationId),
        eq(activities.entityType, entityType),
        eq(activities.entityId, entityId),
      ),
    )
    .orderBy(desc(activities.createdAt));
}

/** How many activities of one type a member produced in the last `windowMs` — the basis of a database-backed rate limit (no shared memory in serverless). */
export async function countRecentActivities(
  organizationId: string,
  actorUserId: string,
  type: ActivityType,
  windowMs: number,
): Promise<number> {
  const [row] = await db
    .select({ total: count() })
    .from(activities)
    .where(
      and(
        eq(activities.organizationId, organizationId),
        eq(activities.actorUserId, actorUserId),
        eq(activities.type, type),
        gt(activities.createdAt, new Date(Date.now() - windowMs)),
      ),
    );
  return row?.total ?? 0;
}
