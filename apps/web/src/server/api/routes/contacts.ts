import { createRoute, OpenAPIHono, z } from '@hono/zod-openapi'
import {
  assignContactToDelegate,
  createAffiliation,
  createContact,
  endAffiliation,
  getContact,
  getCurrentAffiliation,
  listAffiliationHistory,
  listAssignmentHistory,
  listContactActivity,
  listContacts,
  markContactIdentified,
  updateAffiliation,
  updateContact,
  type AffiliationView,
  type ContactView,
} from '@saas/core'
import { cookieAuth, errorResponses, IdParam } from '../openapi.ts'
import { actorCtx } from '../session.ts'
import type { ApiEnv } from '../types.ts'
import { json } from './schemas.ts'

/**
 * Contacts, who answers for them, their affiliation and their timeline (Kindly CRM). The bodies
 * are declared in plain types for the contract; core validates and normalizes them again, so
 * the API and the use cases cannot disagree. A contact the person may not see answers 404.
 */

const ContactSchema = z
  .object({
    id: z.uuid(),
    name: z.string(),
    phone: z.string().nullable(),
    email: z.string().nullable(),
    notes: z.string().nullable(),
    /** Auto-created from an unknown sender and not confirmed yet. */
    isUnassigned: z.boolean(),
    createdAt: z.iso.datetime(),
    updatedAt: z.iso.datetime(),
    referenceDelegate: z
      .object({ memberId: z.uuid(), name: z.string(), since: z.iso.datetime() })
      .nullable(),
  })
  .openapi('Contact')

const toContact = (c: ContactView) => ({
  id: c.id,
  name: c.name,
  phone: c.phone,
  email: c.email,
  notes: c.notes,
  isUnassigned: c.isUnassigned,
  createdAt: c.createdAt.toISOString(),
  updatedAt: c.updatedAt.toISOString(),
  referenceDelegate: c.referenceDelegate && {
    memberId: c.referenceDelegate.memberId,
    name: c.referenceDelegate.name,
    since: c.referenceDelegate.since.toISOString(),
  },
})

const ContactBody = z
  .object({
    name: z.string().min(1).max(160),
    phone: z.string().max(40).nullish().describe('International format, e.g. +34600111222'),
    email: z.string().max(254).nullish(),
    notes: z.string().max(4000).nullish(),
  })
  .openapi('ContactInput')

const AssignmentSchema = z
  .object({
    id: z.uuid(),
    delegateId: z.uuid(),
    delegateName: z.string(),
    startedAt: z.iso.datetime(),
    endedAt: z.iso.datetime().nullable(),
    assignedById: z.uuid().nullable(),
  })
  .openapi('ContactAssignment')

const ActivitySchema = z
  .object({
    id: z.uuid(),
    type: z.string(),
    actorId: z.uuid().nullable(),
    actorName: z.string().nullable(),
    metadata: z.unknown(),
    createdAt: z.iso.datetime(),
  })
  .openapi('Activity')

const AffiliationSchema = z
  .object({
    id: z.uuid(),
    memberNumber: z.string().nullable(),
    status: z.enum(['ACTIVE', 'INACTIVE']),
    startedAt: z.iso.datetime(),
    endedAt: z.iso.datetime().nullable(),
    /** First day of the last month paid (YYYY-MM-DD). */
    feePaidUntil: z.string().nullable(),
    /** Fixed rule computed by the server; never an AI inference. */
    feeOverdue: z.boolean(),
  })
  .openapi('Affiliation')

const toAffiliation = (a: AffiliationView) => ({
  id: a.id,
  memberNumber: a.memberNumber,
  status: a.status,
  startedAt: a.startedAt.toISOString(),
  endedAt: a.endedAt?.toISOString() ?? null,
  feePaidUntil: a.feePaidUntil?.toISOString().slice(0, 10) ?? null,
  feeOverdue: a.feeOverdue,
})

const AffiliationBody = z
  .object({
    memberNumber: z.string().max(40).nullish(),
    startedAt: z.string().max(40).nullish().describe('Date (2026-09-15) or instant'),
    feePaidUntil: z.string().max(10).nullish().describe('Month (2026-09)'),
  })
  .openapi('AffiliationInput')

const list = createRoute({
  method: 'get',
  path: '/contacts',
  tags: ['contacts'],
  summary: 'Contacts the person may see (administrators: all; delegates: their own)',
  security: cookieAuth,
  responses: {
    200: { description: 'Contacts', ...json(z.object({ items: z.array(ContactSchema) })) },
    ...errorResponses(401, 403),
  },
})

const create = createRoute({
  method: 'post',
  path: '/contacts',
  tags: ['contacts'],
  summary: 'Create a contact; its creator becomes the reference delegate',
  security: cookieAuth,
  request: { body: { required: true, ...json(ContactBody) } },
  responses: {
    201: { description: 'Created', ...json(ContactSchema) },
    ...errorResponses(400, 401, 403),
  },
})

const get = createRoute({
  method: 'get',
  path: '/contacts/{id}',
  tags: ['contacts'],
  summary: 'A contact (404 if the person may not see it)',
  security: cookieAuth,
  request: { params: IdParam },
  responses: {
    200: { description: 'Contact', ...json(ContactSchema) },
    ...errorResponses(401, 403, 404),
  },
})

const update = createRoute({
  method: 'put',
  path: '/contacts/{id}',
  tags: ['contacts'],
  summary: 'Replace the editable fields of a contact',
  security: cookieAuth,
  request: { params: IdParam, body: { required: true, ...json(ContactBody) } },
  responses: {
    200: { description: 'Updated', ...json(ContactSchema) },
    ...errorResponses(400, 401, 403, 404),
  },
})

const identified = createRoute({
  method: 'post',
  path: '/contacts/{id}/identified',
  tags: ['contacts'],
  summary: 'Confirm who an auto-created contact is',
  security: cookieAuth,
  request: { params: IdParam },
  responses: {
    200: { description: 'Confirmed', ...json(ContactSchema) },
    ...errorResponses(401, 403, 404),
  },
})

const delegates = createRoute({
  method: 'get',
  path: '/contacts/{id}/delegates',
  tags: ['contacts'],
  summary: 'History of reference delegates, current first',
  security: cookieAuth,
  request: { params: IdParam },
  responses: {
    200: { description: 'History', ...json(z.object({ items: z.array(AssignmentSchema) })) },
    ...errorResponses(401, 403, 404),
  },
})

const assign = createRoute({
  method: 'put',
  path: '/contacts/{id}/delegate',
  tags: ['contacts'],
  summary: 'Reassign the reference delegate (administrators)',
  security: cookieAuth,
  request: {
    params: IdParam,
    body: { required: true, ...json(z.object({ delegateId: z.uuid() })) },
  },
  responses: {
    200: { description: 'Assigned', ...json(AssignmentSchema) },
    ...errorResponses(400, 401, 403, 404, 409),
  },
})

const activity = createRoute({
  method: 'get',
  path: '/contacts/{id}/activity',
  tags: ['contacts'],
  summary: 'Timeline of a contact, newest first',
  security: cookieAuth,
  request: { params: IdParam },
  responses: {
    200: { description: 'Timeline', ...json(z.object({ items: z.array(ActivitySchema) })) },
    ...errorResponses(401, 403, 404),
  },
})

const affiliation = createRoute({
  method: 'get',
  path: '/contacts/{id}/affiliation',
  tags: ['contacts'],
  summary: 'Current affiliation of a contact and its history (every period, current first)',
  security: cookieAuth,
  request: { params: IdParam },
  responses: {
    200: {
      description: 'Affiliation',
      ...json(
        z.object({
          current: AffiliationSchema.nullable(),
          history: z.array(AffiliationSchema),
        }),
      ),
    },
    ...errorResponses(401, 403, 404),
  },
})

const affiliate = createRoute({
  method: 'post',
  path: '/contacts/{id}/affiliation',
  tags: ['contacts'],
  summary: 'Alta (or rejoin after a leave)',
  security: cookieAuth,
  request: { params: IdParam, body: { required: true, ...json(AffiliationBody) } },
  responses: {
    201: { description: 'Created', ...json(AffiliationSchema) },
    ...errorResponses(400, 401, 403, 404, 409),
  },
})

const editAffiliation = createRoute({
  method: 'put',
  path: '/contacts/{id}/affiliation',
  tags: ['contacts'],
  summary: 'Edit the open affiliation period',
  security: cookieAuth,
  request: { params: IdParam, body: { required: true, ...json(AffiliationBody) } },
  responses: {
    200: { description: 'Updated', ...json(AffiliationSchema) },
    ...errorResponses(400, 401, 403, 404, 409),
  },
})

const leave = createRoute({
  method: 'post',
  path: '/contacts/{id}/affiliation/end',
  tags: ['contacts'],
  summary: 'Leave ("dar de baja"): close the open period',
  security: cookieAuth,
  request: { params: IdParam },
  responses: {
    200: { description: 'Ended', ...json(AffiliationSchema) },
    ...errorResponses(401, 403, 404, 409),
  },
})

export const contactRoutes = new OpenAPIHono<ApiEnv>()
  .openapi(list, async (c) => {
    const items = await listContacts(await actorCtx(c))
    return c.json({ items: items.map(toContact) }, 200)
  })
  .openapi(create, async (c) => {
    return c.json(toContact(await createContact(await actorCtx(c), c.req.valid('json'))), 201)
  })
  .openapi(get, async (c) => {
    return c.json(toContact(await getContact(await actorCtx(c), c.req.valid('param').id)), 200)
  })
  .openapi(update, async (c) => {
    const contact = await updateContact(
      await actorCtx(c),
      c.req.valid('param').id,
      c.req.valid('json'),
    )
    return c.json(toContact(contact), 200)
  })
  .openapi(identified, async (c) => {
    const contact = await markContactIdentified(await actorCtx(c), c.req.valid('param').id)
    return c.json(toContact(contact), 200)
  })
  .openapi(delegates, async (c) => {
    const items = await listAssignmentHistory(await actorCtx(c), c.req.valid('param').id)
    return c.json(
      {
        items: items.map((a) => ({
          id: a.id,
          delegateId: a.delegateId,
          delegateName: a.delegateName,
          startedAt: a.startedAt.toISOString(),
          endedAt: a.endedAt?.toISOString() ?? null,
          assignedById: a.assignedById,
        })),
      },
      200,
    )
  })
  .openapi(assign, async (c) => {
    const a = await assignContactToDelegate(
      await actorCtx(c),
      c.req.valid('param').id,
      c.req.valid('json').delegateId,
    )
    return c.json(
      {
        id: a.id,
        delegateId: a.delegateId,
        delegateName: a.delegateName,
        startedAt: a.startedAt.toISOString(),
        endedAt: a.endedAt?.toISOString() ?? null,
        assignedById: a.assignedById,
      },
      200,
    )
  })
  .openapi(activity, async (c) => {
    const items = await listContactActivity(await actorCtx(c), c.req.valid('param').id)
    return c.json(
      { items: items.map((a) => ({ ...a, createdAt: a.createdAt.toISOString() })) },
      200,
    )
  })
  .openapi(affiliation, async (c) => {
    const ctx = await actorCtx(c)
    const { id } = c.req.valid('param')
    const [current, history] = await Promise.all([
      getCurrentAffiliation(ctx, id),
      listAffiliationHistory(ctx, id),
    ])
    return c.json(
      { current: current && toAffiliation(current), history: history.map(toAffiliation) },
      200,
    )
  })
  .openapi(affiliate, async (c) => {
    const a = await createAffiliation(
      await actorCtx(c),
      c.req.valid('param').id,
      c.req.valid('json'),
    )
    return c.json(toAffiliation(a), 201)
  })
  .openapi(editAffiliation, async (c) => {
    const a = await updateAffiliation(
      await actorCtx(c),
      c.req.valid('param').id,
      c.req.valid('json'),
    )
    return c.json(toAffiliation(a), 200)
  })
  .openapi(leave, async (c) => {
    return c.json(
      toAffiliation(await endAffiliation(await actorCtx(c), c.req.valid('param').id)),
      200,
    )
  })
