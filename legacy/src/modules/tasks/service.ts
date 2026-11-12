import "server-only";
import { and, desc, eq, isNull, or, type SQL } from "drizzle-orm";
import { db } from "@/db/client";
import { tasks } from "@/modules/tasks/schema";
import { getContact } from "@/modules/contacts/service";
import { contactVisibilityCondition, type VisibilityMember } from "@/modules/contacts/visibility";
import { getCase } from "@/modules/cases/service";
import { isOrganizationMember } from "@/modules/organizations/service";
import { recordActivity } from "@/modules/audit/service";

export { isTaskPending } from "@/modules/tasks/domain";

export async function listTasks(organizationId: string) {
  return db
    .select()
    .from(tasks)
    .where(eq(tasks.organizationId, organizationId))
    .orderBy(desc(tasks.createdAt));
}

/** Tasks with `completedAt IS NULL` — "pending" is derived, not stored. */
export async function listPendingTasks(organizationId: string) {
  return db
    .select()
    .from(tasks)
    .where(and(eq(tasks.organizationId, organizationId), isNull(tasks.completedAt)))
    .orderBy(desc(tasks.createdAt));
}

export async function getTask(organizationId: string, taskId: string) {
  const [row] = await db
    .select()
    .from(tasks)
    .where(and(eq(tasks.organizationId, organizationId), eq(tasks.id, taskId)))
    .limit(1);
  return row ?? null;
}

/**
 * `tasks.contactId` is nullable (a general task with no afiliado attached),
 * unlike `cases.contactId` — so a Task is visible when it has no Contact at
 * all, *or* when the one it has is visible. `undefined` for an ADMIN (no
 * filter): folding `contactVisibilityCondition`'s own `undefined` into an
 * `or(isNull(...), undefined)` would silently collapse to "only contactless
 * tasks", hiding every other Task from an ADMIN — this checks that case
 * explicitly instead.
 */
function taskVisibilityCondition(organizationId: string, member: VisibilityMember): SQL | undefined {
  const contactCondition = contactVisibilityCondition(organizationId, member, tasks.contactId);
  if (!contactCondition) {
    return undefined;
  }
  return or(isNull(tasks.contactId), contactCondition);
}

/**
 * Visibility-scoped variants (PKG-014). `listTasks`/`getTask` above stay
 * unscoped for internal FK-integrity checks; `listPendingTasks` has no
 * caller yet (pre-existing, reserved for a future dashboard) so it gets no
 * member-scoped twin until something needs one.
 */
export async function listTasksForMember(organizationId: string, member: VisibilityMember) {
  return db
    .select()
    .from(tasks)
    .where(and(eq(tasks.organizationId, organizationId), taskVisibilityCondition(organizationId, member)))
    .orderBy(desc(tasks.createdAt));
}

export async function getTaskForMember(organizationId: string, member: VisibilityMember, taskId: string) {
  const [row] = await db
    .select()
    .from(tasks)
    .where(
      and(eq(tasks.organizationId, organizationId), eq(tasks.id, taskId), taskVisibilityCondition(organizationId, member)),
    )
    .limit(1);
  return row ?? null;
}

/**
 * A single Contact's Tasks, for the conversation ficha (UI-10a). Unlike
 * `taskVisibilityCondition` (which also admits `contactId IS NULL` general
 * tasks), a specific `contactId` is already given, so only
 * `contactVisibilityCondition` applies.
 */
export async function listTasksForContact(organizationId: string, member: VisibilityMember, contactId: string) {
  return db
    .select()
    .from(tasks)
    .where(
      and(
        eq(tasks.organizationId, organizationId),
        eq(tasks.contactId, contactId),
        contactVisibilityCondition(organizationId, member, tasks.contactId),
      ),
    )
    .orderBy(desc(tasks.createdAt));
}

async function assertRelatedEntitiesBelongToOrganization(
  organizationId: string,
  contactId: string | null | undefined,
  caseId: string | null | undefined,
  assignedTo: string | null | undefined,
) {
  if (contactId && !(await getContact(organizationId, contactId))) {
    throw new Error("Contact not found in this organization.");
  }
  if (caseId && !(await getCase(organizationId, caseId))) {
    throw new Error("Case not found in this organization.");
  }
  if (assignedTo && !(await isOrganizationMember(organizationId, assignedTo))) {
    throw new Error("Cannot assign a task to a user outside the organization.");
  }
}

export interface CreateTaskInput {
  organizationId: string;
  actorUserId: string;
  title: string;
  description?: string | null;
  contactId?: string | null;
  caseId?: string | null;
  assignedTo?: string | null;
  dueDate?: Date | null;
}

export async function createTask(input: CreateTaskInput) {
  await assertRelatedEntitiesBelongToOrganization(
    input.organizationId,
    input.contactId,
    input.caseId,
    input.assignedTo,
  );

  const [task] = await db
    .insert(tasks)
    .values({
      organizationId: input.organizationId,
      title: input.title,
      description: input.description || null,
      contactId: input.contactId || null,
      caseId: input.caseId || null,
      assignedTo: input.assignedTo || null,
      dueDate: input.dueDate ?? null,
    })
    .returning();

  await recordActivity({
    organizationId: input.organizationId,
    type: "TASK_CREATED",
    actorUserId: input.actorUserId,
    entityType: "task",
    entityId: task.id,
  });

  return task;
}

export interface UpdateTaskInput {
  organizationId: string;
  actorUserId: string;
  taskId: string;
  title: string;
  description?: string | null;
  contactId?: string | null;
  caseId?: string | null;
  assignedTo?: string | null;
  dueDate?: Date | null;
  completed: boolean;
}

export async function updateTask(input: UpdateTaskInput) {
  const existing = await getTask(input.organizationId, input.taskId);
  if (!existing) {
    return null;
  }

  await assertRelatedEntitiesBelongToOrganization(
    input.organizationId,
    input.contactId,
    input.caseId,
    input.assignedTo,
  );

  const wasCompleted = existing.completedAt !== null;
  const completedAt = input.completed ? (existing.completedAt ?? new Date()) : null;

  const [updated] = await db
    .update(tasks)
    .set({
      title: input.title,
      description: input.description || null,
      contactId: input.contactId || null,
      caseId: input.caseId || null,
      assignedTo: input.assignedTo || null,
      dueDate: input.dueDate ?? null,
      completedAt,
      updatedAt: new Date(),
    })
    .where(and(eq(tasks.organizationId, input.organizationId), eq(tasks.id, input.taskId)))
    .returning();

  if (!updated) {
    return null;
  }

  if (input.completed && !wasCompleted) {
    await recordActivity({
      organizationId: input.organizationId,
      type: "TASK_COMPLETED",
      actorUserId: input.actorUserId,
      entityType: "task",
      entityId: updated.id,
    });
  }

  return updated;
}
