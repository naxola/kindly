import "server-only";
import { and, desc, eq, isNull } from "drizzle-orm";
import { db } from "@/db/client";
import { tasks } from "@/modules/tasks/schema";
import { getContact } from "@/modules/contacts/service";
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
