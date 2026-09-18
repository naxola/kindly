import "server-only";
import { and, desc, eq } from "drizzle-orm";
import { db } from "@/db/client";
import { activities } from "@/modules/audit/schema";

export type ActivityEntityType = "contact" | "case" | "task";

/**
 * Beyond the "tipos mínimos" documented in docs/DATABASE.md sección 12
 * (CASE_CREATED, CASE_ASSIGNED, TASK_CREATED, TASK_COMPLETED), this adds
 * CONTACT_CREATED/CONTACT_UPDATED and CASE_STATUS_CHANGED — natural
 * extensions for the entities PKG-002 actually manages. The docs call that
 * list "mínimos", not closed.
 */
export type ActivityType =
  | "CONTACT_CREATED"
  | "CONTACT_UPDATED"
  | "CASE_CREATED"
  | "CASE_ASSIGNED"
  | "CASE_STATUS_CHANGED"
  | "TASK_CREATED"
  | "TASK_COMPLETED";

interface RecordActivityInput {
  organizationId: string;
  type: ActivityType;
  actorUserId: string;
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
