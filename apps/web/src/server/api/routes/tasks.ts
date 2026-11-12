import { createRoute, OpenAPIHono, z } from '@hono/zod-openapi'
import {
  createTask,
  getTask,
  listTaskActivity,
  listTasks,
  setTaskCompleted,
  updateTask,
  type TaskView,
} from '@saas/core'
import { cookieAuth, errorResponses, IdParam } from '../openapi.ts'
import { actorCtx } from '../session.ts'
import type { ApiEnv } from '../types.ts'
import { json } from './schemas.ts'

/**
 * Tasks (Kindly CRM). The bodies are declared in plain types for the contract; core validates and
 * normalizes them again. A task about a contact the person may not see answers 404.
 */

const TaskSchema = z
  .object({
    id: z.uuid(),
    title: z.string(),
    description: z.string().nullable(),
    dueDate: z.iso.datetime().nullable(),
    /** Null while pending: a task is pending exactly when it has no completion date. */
    completedAt: z.iso.datetime().nullable(),
    createdAt: z.iso.datetime(),
    updatedAt: z.iso.datetime(),
    contact: z.object({ id: z.uuid(), name: z.string() }).nullable(),
    assignee: z.object({ memberId: z.uuid(), name: z.string() }).nullable(),
  })
  .openapi('Task')

const toTask = (t: TaskView) => ({
  id: t.id,
  title: t.title,
  description: t.description,
  dueDate: t.dueDate?.toISOString() ?? null,
  completedAt: t.completedAt?.toISOString() ?? null,
  createdAt: t.createdAt.toISOString(),
  updatedAt: t.updatedAt.toISOString(),
  contact: t.contact,
  assignee: t.assignee,
})

const TaskBody = z
  .object({
    title: z.string().min(1).max(200),
    description: z.string().max(4000).nullish(),
    contactId: z.uuid().nullish(),
    /** organization_members.id of whoever has to do it. */
    assigneeId: z.uuid().nullish(),
    dueDate: z.string().max(40).nullish().describe('Date (2026-12-01) or instant'),
  })
  .openapi('TaskInput')

const UpdateBody = TaskBody.extend({ completed: z.boolean() }).openapi('TaskUpdateInput')

const list = createRoute({
  method: 'get',
  path: '/tasks',
  tags: ['tasks'],
  summary: 'Tasks the person may see (general ones and those of contacts they may see)',
  security: cookieAuth,
  request: { query: z.object({ status: z.enum(['all', 'pending', 'done']).optional() }) },
  responses: {
    200: { description: 'Tasks', ...json(z.object({ items: z.array(TaskSchema) })) },
    ...errorResponses(400, 401, 403),
  },
})

const create = createRoute({
  method: 'post',
  path: '/tasks',
  tags: ['tasks'],
  summary: 'Create a task',
  security: cookieAuth,
  request: { body: { required: true, ...json(TaskBody) } },
  responses: {
    201: { description: 'Created', ...json(TaskSchema) },
    ...errorResponses(400, 401, 403),
  },
})

const get = createRoute({
  method: 'get',
  path: '/tasks/{id}',
  tags: ['tasks'],
  summary: 'A task (404 if the person may not see it)',
  security: cookieAuth,
  request: { params: IdParam },
  responses: {
    200: { description: 'Task', ...json(TaskSchema) },
    ...errorResponses(401, 403, 404),
  },
})

const update = createRoute({
  method: 'put',
  path: '/tasks/{id}',
  tags: ['tasks'],
  summary: 'Replace the editable fields and the completion of a task',
  security: cookieAuth,
  request: { params: IdParam, body: { required: true, ...json(UpdateBody) } },
  responses: {
    200: { description: 'Updated', ...json(TaskSchema) },
    ...errorResponses(400, 401, 403, 404),
  },
})

const complete = createRoute({
  method: 'put',
  path: '/tasks/{id}/completed',
  tags: ['tasks'],
  summary: 'Complete or reopen a task (idempotent)',
  security: cookieAuth,
  request: {
    params: IdParam,
    body: { required: true, ...json(z.object({ completed: z.boolean() })) },
  },
  responses: {
    200: { description: 'Updated', ...json(TaskSchema) },
    ...errorResponses(400, 401, 403, 404),
  },
})

const activity = createRoute({
  method: 'get',
  path: '/tasks/{id}/activity',
  tags: ['tasks'],
  summary: 'Timeline of a task, newest first',
  security: cookieAuth,
  request: { params: IdParam },
  responses: {
    200: {
      description: 'Timeline',
      ...json(
        z.object({
          items: z.array(
            z.object({
              id: z.uuid(),
              type: z.string(),
              actorName: z.string().nullable(),
              createdAt: z.iso.datetime(),
            }),
          ),
        }),
      ),
    },
    ...errorResponses(401, 403, 404),
  },
})

export const taskRoutes = new OpenAPIHono<ApiEnv>()
  .openapi(list, async (c) => {
    const items = await listTasks(await actorCtx(c), {
      status: c.req.valid('query').status ?? 'all',
    })
    return c.json({ items: items.map(toTask) }, 200)
  })
  .openapi(create, async (c) => {
    return c.json(toTask(await createTask(await actorCtx(c), c.req.valid('json'))), 201)
  })
  .openapi(get, async (c) => {
    return c.json(toTask(await getTask(await actorCtx(c), c.req.valid('param').id)), 200)
  })
  .openapi(update, async (c) => {
    const task = await updateTask(await actorCtx(c), c.req.valid('param').id, c.req.valid('json'))
    return c.json(toTask(task), 200)
  })
  .openapi(complete, async (c) => {
    const task = await setTaskCompleted(
      await actorCtx(c),
      c.req.valid('param').id,
      c.req.valid('json').completed,
    )
    return c.json(toTask(task), 200)
  })
  .openapi(activity, async (c) => {
    const items = await listTaskActivity(await actorCtx(c), c.req.valid('param').id)
    return c.json(
      { items: items.map((a) => ({ ...a, createdAt: a.createdAt.toISOString() })) },
      200,
    )
  })
