import "server-only";
import { and, desc, eq } from "drizzle-orm";
import { db } from "@/db/client";
import { activities } from "@/modules/audit/schema";

export type ActivityEntityType =
  | "contact"
  | "case"
  | "task"
  | "conversation"
  | "messaging_account"
  | "organization";

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
 * PKG-006 adds MEMBER_INVITED/MEMBER_JOINED/INVITATION_REVOKED, the first
 * activities whose entity is the Organization itself.
 * The docs call that list "mínimos", not closed.
 */
export type ActivityType =
  | "CONTACT_CREATED"
  | "CONTACT_UPDATED"
  | "CONTACT_IDENTIFIED"
  | "CASE_CREATED"
  | "CASE_ASSIGNED"
  | "CASE_STATUS_CHANGED"
  | "TASK_CREATED"
  | "TASK_COMPLETED"
  | "MESSAGE_RECEIVED"
  | "MESSAGE_SENT"
  | "MESSAGE_SENT_FROM_DEVICE"
  | "CONVERSATION_REASSIGNED"
  | "CHANNEL_CONNECTED"
  | "CHANNEL_DISCONNECTED"
  | "MEMBER_INVITED"
  | "MEMBER_JOINED"
  | "INVITATION_REVOKED";

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
