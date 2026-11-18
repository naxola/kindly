import { withTenant, type Task, type TenantTx } from '@saas/database'
import type { Ctx } from '../../context.ts'
import { DomainError } from '../../errors.ts'
import { listActivitiesForEntity, recordActivity } from '../activity/index.ts'
import { writeAudit } from '../audit/index.ts'
import { assertContactVisible } from '../contacts/index.ts'
import { assertConversationVisible } from '../conversations/index.ts'
import { authorize } from '../identity/index.ts'
import { displayNamesOf } from '../team/index.ts'
import { TaskInput, UpdateTaskInput } from './schemas.ts'
import { taskVisibilityWhere } from './visibility.ts'

export interface TaskView extends Task {
  contact: { id: string; name: string } | null
  assignee: { memberId: string; name: string } | null
}

type WithContact = Task & { contact: { id: string; name: string } | null }

const include = { contact: { select: { id: true, name: true } } } as const

async function views(tx: TenantTx, rows: WithContact[]): Promise<TaskView[]> {
  const names = await displayNamesOf(
    tx,
    rows.flatMap((r) => (r.assigneeId ? [r.assigneeId] : [])),
  )
  return rows.map((r) => ({
    ...r,
    assignee: r.assigneeId ? { memberId: r.assigneeId, name: names.get(r.assigneeId) ?? '' } : null,
  }))
}

/** Tasks the actor may see, newest first (optionally only those about one contact). */
export async function listTasks(
  ctx: Ctx,
  {
    status = 'all',
    contactId,
  }: { status?: 'all' | 'pending' | 'done'; contactId?: string | undefined } = {},
): Promise<TaskView[]> {
  authorize(ctx.actor, 'tasks.read')
  return withTenant(ctx.db, ctx.actor.organizationId, async (tx) => {
    const rows = await tx.task.findMany({
      where: {
        ...(await taskVisibilityWhere(tx, ctx.actor)),
        ...(contactId ? { contactId } : {}),
        ...(status === 'pending' ? { completedAt: null } : {}),
        ...(status === 'done' ? { completedAt: { not: null } } : {}),
      },
      include,
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
    })
    return views(tx, rows)
  })
}

async function findVisible(tx: TenantTx, ctx: Ctx, taskId: string): Promise<WithContact> {
  const row = await tx.task.findFirst({
    where: { id: taskId, ...(await taskVisibilityWhere(tx, ctx.actor)) },
    include,
  })
  if (!row) throw new DomainError('NOT_FOUND', 'Task not found')
  return row
}

export async function getTask(ctx: Ctx, taskId: string): Promise<TaskView> {
  authorize(ctx.actor, 'tasks.read')
  return withTenant(ctx.db, ctx.actor.organizationId, async (tx) => {
    const [view] = await views(tx, [await findVisible(tx, ctx, taskId)])
    return view!
  })
}

/**
 * The contact must be visible to the actor, the conversation too and about that same contact, and
 * the assignee an active member. Returns the contact the task ends up with: the one given, or
 * (when only a conversation is given) the conversation's.
 */
async function assertRelated(
  tx: TenantTx,
  ctx: Ctx,
  data: { contactId?: string | null; conversationId?: string | null; assigneeId?: string | null },
): Promise<{ contactId: string | null }> {
  let contactId = data.contactId ?? null
  if (data.conversationId) {
    authorize(ctx.actor, 'conversations.read')
    const conversation = await assertConversationVisible(tx, ctx, data.conversationId).catch(() => {
      throw new DomainError('VALIDATION_FAILED', 'Unknown conversation', [
        { path: 'conversationId', code: 'INVALID_CONVERSATION' },
      ])
    })
    if (contactId && contactId !== conversation.contactId) {
      throw new DomainError('VALIDATION_FAILED', 'The conversation is about another contact', [
        { path: 'conversationId', code: 'CONVERSATION_CONTACT_MISMATCH' },
      ])
    }
    contactId = conversation.contactId
  }
  if (contactId) {
    try {
      await assertContactVisible(tx, ctx.actor, contactId)
    } catch {
      throw new DomainError('VALIDATION_FAILED', 'Unknown contact', [
        { path: 'contactId', code: 'INVALID_CONTACT' },
      ])
    }
  }
  if (data.assigneeId) {
    const member = await tx.organizationMember.findFirst({
      where: { id: data.assigneeId, status: 'ACTIVE' },
      select: { id: true },
    })
    if (!member) {
      throw new DomainError('VALIDATION_FAILED', 'The assignee is not an active member', [
        { path: 'assigneeId', code: 'INVALID_ASSIGNEE' },
      ])
    }
  }
  return { contactId }
}

export async function createTask(ctx: Ctx, input: TaskInput): Promise<TaskView> {
  authorize(ctx.actor, 'tasks.write')
  const data = TaskInput.parse(input)
  return withTenant(ctx.db, ctx.actor.organizationId, async (tx) => {
    const { contactId } = await assertRelated(tx, ctx, data)
    const task = await tx.task.create({
      data: {
        organizationId: ctx.actor.organizationId,
        title: data.title,
        description: data.description ?? null,
        contactId,
        conversationId: data.conversationId ?? null,
        assigneeId: data.assigneeId ?? null,
        dueDate: data.dueDate ?? null,
      },
      include,
    })
    await record(ctx, tx, 'TASK_CREATED', task.id)
    const [view] = await views(tx, [task])
    return view!
  })
}

/**
 * Replaces the editable fields and the completion in one call (the form sends everything).
 * Completing it records TASK_COMPLETED once: saving an already completed task changes nothing
 * about when it was completed.
 */
export async function updateTask(
  ctx: Ctx,
  taskId: string,
  input: UpdateTaskInput,
): Promise<TaskView> {
  authorize(ctx.actor, 'tasks.write')
  const data = UpdateTaskInput.parse(input)
  return withTenant(ctx.db, ctx.actor.organizationId, async (tx) => {
    const existing = await findVisible(tx, ctx, taskId)
    // Leaving the conversation out keeps the link, as long as the task is still about the same
    // contact; a task moved to another contact (or none) cannot keep a conversation of the old one.
    const conversationId =
      data.conversationId === undefined
        ? (data.contactId ?? null) === existing.contactId
          ? existing.conversationId
          : null
        : data.conversationId
    const { contactId } = await assertRelated(tx, ctx, { ...data, conversationId })
    const justCompleted = data.completed && existing.completedAt === null
    const task = await tx.task.update({
      where: { id: taskId },
      data: {
        title: data.title,
        description: data.description ?? null,
        contactId,
        conversationId,
        assigneeId: data.assigneeId ?? null,
        dueDate: data.dueDate ?? null,
        completedAt: data.completed ? (existing.completedAt ?? ctx.now?.() ?? new Date()) : null,
      },
      include,
    })
    if (justCompleted) await record(ctx, tx, 'TASK_COMPLETED', taskId)
    else await audit(ctx, tx, 'task.updated', taskId)
    const [view] = await views(tx, [task])
    return view!
  })
}

/** One-click completion from the list. Idempotent. */
export async function setTaskCompleted(
  ctx: Ctx,
  taskId: string,
  completed: boolean,
): Promise<TaskView> {
  authorize(ctx.actor, 'tasks.write')
  return withTenant(ctx.db, ctx.actor.organizationId, async (tx) => {
    const existing = await findVisible(tx, ctx, taskId)
    if (completed === (existing.completedAt !== null)) {
      const [view] = await views(tx, [existing])
      return view!
    }
    const task = await tx.task.update({
      where: { id: taskId },
      data: { completedAt: completed ? (ctx.now?.() ?? new Date()) : null },
      include,
    })
    if (completed) await record(ctx, tx, 'TASK_COMPLETED', taskId)
    else await audit(ctx, tx, 'task.reopened', taskId)
    const [view] = await views(tx, [task])
    return view!
  })
}

export interface TaskActivityView {
  id: string
  type: string
  actorName: string | null
  createdAt: Date
}

/** Timeline of a visible task, newest first. */
export async function listTaskActivity(ctx: Ctx, taskId: string): Promise<TaskActivityView[]> {
  authorize(ctx.actor, 'tasks.read')
  return withTenant(ctx.db, ctx.actor.organizationId, async (tx) => {
    await findVisible(tx, ctx, taskId)
    const rows = await listActivitiesForEntity(tx, 'task', taskId)
    const names = await displayNamesOf(
      tx,
      rows.flatMap((r) => (r.actorId ? [r.actorId] : [])),
    )
    return rows.map((r) => ({
      id: r.id,
      type: r.type,
      actorName: r.actorId ? (names.get(r.actorId) ?? null) : null,
      createdAt: r.createdAt,
    }))
  })
}

async function record(ctx: Ctx, tx: TenantTx, type: 'TASK_CREATED' | 'TASK_COMPLETED', id: string) {
  await recordActivity(tx, {
    organizationId: ctx.actor.organizationId,
    type,
    actorMemberId: ctx.actor.memberId,
    entityType: 'task',
    entityId: id,
  })
  await audit(ctx, tx, type === 'TASK_CREATED' ? 'task.created' : 'task.completed', id)
}

// Ids only: titles and descriptions may carry personal data.
const audit = (ctx: Ctx, tx: TenantTx, action: string, taskId: string) =>
  writeAudit(tx, {
    organizationId: ctx.actor.organizationId,
    actorUserId: ctx.actor.userId,
    action,
    resourceType: 'task',
    resourceId: taskId,
    correlationId: ctx.correlationId,
    ip: ctx.ip,
  })
