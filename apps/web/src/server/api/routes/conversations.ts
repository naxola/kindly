import { createRoute, OpenAPIHono, z } from '@hono/zod-openapi'
import {
  countConversations,
  getConversationDetail,
  INBOX_VIEWS,
  listConversationChannels,
  listConversations,
  listThreadMessages,
  markConversationRead,
  sendMessage,
  signalTyping,
  type ConversationPreview,
} from '@saas/core'
import { messaging } from '../../messaging.ts'
import { cookieAuth, errorResponses, IdParam } from '../openapi.ts'
import { rateLimit } from '../rate-limit.ts'
import { actorCtx } from '../session.ts'
import type { ApiEnv } from '../types.ts'
import { json } from './schemas.ts'

/**
 * The inbox and the conversation thread. A conversation of a contact the person may not see
 * answers 404, like a missing one. Replying is only possible from one's own account (the use case
 * enforces it): the answer to anyone else is 403 `NOT_ACCOUNT_OWNER`.
 */

const View = z.enum(INBOX_VIEWS as unknown as [string, ...string[]])

const MessageSchema = z
  .object({
    id: z.uuid(),
    direction: z.enum(['INBOUND', 'OUTBOUND']),
    body: z.string(),
    deliveryStatus: z.enum(['PENDING', 'SENT', 'DELIVERED', 'READ', 'FAILED']),
    sentFromDevice: z.boolean(),
    createdAt: z.iso.datetime(),
  })
  .openapi('Message')

const PreviewSchema = z
  .object({
    id: z.uuid(),
    contactId: z.uuid(),
    contactName: z.string(),
    contactIsUnassigned: z.boolean(),
    channel: z.string(),
    delegateId: z.uuid().describe("Owner of the conversation's account"),
    referenceDelegateId: z.uuid().nullable(),
    lastMessage: z
      .object({
        body: z.string(),
        direction: z.enum(['INBOUND', 'OUTBOUND']),
        createdAt: z.iso.datetime(),
        deliveryStatus: z.enum(['PENDING', 'SENT', 'DELIVERED', 'READ', 'FAILED']),
        sentFromDevice: z.boolean(),
      })
      .nullable(),
    unread: z.boolean(),
  })
  .openapi('ConversationPreview')

const toPreview = (c: ConversationPreview) => ({
  ...c,
  lastMessage: c.lastMessage && {
    ...c.lastMessage,
    createdAt: c.lastMessage.createdAt.toISOString(),
  },
})

const DetailSchema = z
  .object({
    id: z.uuid(),
    channel: z.string(),
    contact: z.object({
      id: z.uuid(),
      name: z.string(),
      phone: z.string().nullable(),
      isUnassigned: z.boolean(),
    }),
    account: z.object({
      id: z.uuid(),
      delegateId: z.uuid(),
      delegateName: z.string(),
      status: z.enum([
        'PENDING',
        'CONNECTING',
        'CONNECTED',
        'DEGRADED',
        'DISCONNECTED',
        'REVOKED',
        'ERROR',
      ]),
    }),
    referenceDelegateId: z.uuid().nullable(),
    referenceDelegateName: z.string().nullable(),
    supportsTyping: z.boolean(),
    serviceWindow: z.object({
      status: z.enum(['OPEN', 'CLOSED', 'NOT_APPLICABLE']),
      expiresAt: z.iso.datetime().nullable(),
    }),
    canReply: z.boolean(),
  })
  .openapi('ConversationDetail')

// Outbound sending is rate limited (CLAUDE.md §5): per conversation, whoever writes in it.
const conversationKey = (c: { req: { param: (name: string) => string | undefined } }) => [
  c.req.param('id') ?? null,
]
const sendLimit = rateLimit({ limit: 30, windowMs: 60_000, keys: conversationKey })
// The composer asks at most once every 20 s; this only stops a misbehaving client.
const typingLimit = rateLimit({ limit: 12, windowMs: 60_000, keys: conversationKey })

const list = createRoute({
  method: 'get',
  path: '/conversations',
  tags: ['conversations'],
  summary: 'Conversations the person may see, newest activity first',
  security: cookieAuth,
  request: {
    query: z.object({
      view: View.optional(),
      channel: z.string().max(60).optional(),
      delegateId: z.uuid().optional(),
      contactId: z.uuid().optional(),
      search: z.string().max(200).optional(),
      limit: z.coerce.number().int().min(1).max(200).optional(),
    }),
  },
  responses: {
    200: { description: 'Conversations', ...json(z.object({ items: z.array(PreviewSchema) })) },
    ...errorResponses(400, 401, 403),
  },
})

const counts = createRoute({
  method: 'get',
  path: '/conversations/counts',
  tags: ['conversations'],
  summary: 'Counters of the four views (ignoring the search text)',
  security: cookieAuth,
  request: {
    query: z.object({ channel: z.string().max(60).optional(), delegateId: z.uuid().optional() }),
  },
  responses: {
    200: {
      description: 'Counters',
      ...json(
        z.object({
          pending: z.number().int(),
          unread: z.number().int(),
          unassigned: z.number().int(),
          all: z.number().int(),
        }),
      ),
    },
    ...errorResponses(400, 401, 403),
  },
})

const channels = createRoute({
  method: 'get',
  path: '/conversations/channels',
  tags: ['conversations'],
  summary: 'Channels with at least one conversation the person may see',
  security: cookieAuth,
  responses: {
    200: { description: 'Channels', ...json(z.object({ items: z.array(z.string()) })) },
    ...errorResponses(401, 403),
  },
})

const detail = createRoute({
  method: 'get',
  path: '/conversations/{id}',
  tags: ['conversations'],
  summary:
    'A conversation with its contact, account, service window and whether the person can reply',
  security: cookieAuth,
  request: { params: IdParam },
  responses: {
    200: { description: 'Conversation', ...json(DetailSchema) },
    ...errorResponses(401, 403, 404),
  },
})

const thread = createRoute({
  method: 'get',
  path: '/conversations/{id}/messages',
  tags: ['conversations'],
  summary: 'The last messages of a conversation, oldest first',
  security: cookieAuth,
  request: { params: IdParam },
  responses: {
    200: { description: 'Messages', ...json(z.object({ items: z.array(MessageSchema) })) },
    ...errorResponses(401, 403, 404),
  },
})

const send = createRoute({
  method: 'post',
  path: '/conversations/{id}/messages',
  tags: ['conversations'],
  summary: "Reply from the person's OWN account (a rejected send is stored as FAILED)",
  security: cookieAuth,
  middleware: [sendLimit] as const,
  request: {
    params: IdParam,
    body: { required: true, ...json(z.object({ text: z.string().min(1).max(4096) })) },
  },
  responses: {
    201: { description: 'Sent', ...json(MessageSchema) },
    ...errorResponses(400, 401, 403, 404, 409),
  },
})

const typing = createRoute({
  method: 'post',
  path: '/conversations/{id}/typing',
  tags: ['conversations'],
  summary: 'Show "typing…" to the contact while the person writes (own account only; never fatal)',
  security: cookieAuth,
  middleware: [typingLimit] as const,
  request: { params: IdParam },
  responses: { 204: { description: 'Accepted' }, ...errorResponses(401, 403, 404, 429) },
})

const read = createRoute({
  method: 'post',
  path: '/conversations/{id}/read',
  tags: ['conversations'],
  summary: 'Mark a conversation as read, now',
  security: cookieAuth,
  request: { params: IdParam },
  responses: { 204: { description: 'Marked' }, ...errorResponses(401, 403, 404) },
})

const toMessage = (m: {
  id: string
  direction: 'INBOUND' | 'OUTBOUND'
  body: string
  deliveryStatus: 'PENDING' | 'SENT' | 'DELIVERED' | 'READ' | 'FAILED'
  sentFromDevice: boolean
  createdAt: Date
}) => ({
  id: m.id,
  direction: m.direction,
  body: m.body,
  deliveryStatus: m.deliveryStatus,
  sentFromDevice: m.sentFromDevice,
  createdAt: m.createdAt.toISOString(),
})

export const conversationRoutes = new OpenAPIHono<ApiEnv>()
  // Static paths first: "counts" and "channels" are not conversation ids.
  .openapi(counts, async (c) => {
    return c.json(await countConversations(await actorCtx(c), c.req.valid('query')), 200)
  })
  .openapi(channels, async (c) => {
    return c.json({ items: await listConversationChannels(await actorCtx(c)) }, 200)
  })
  .openapi(list, async (c) => {
    const q = c.req.valid('query')
    const items = await listConversations(await actorCtx(c), {
      ...(q.view ? { view: q.view as (typeof INBOX_VIEWS)[number] } : {}),
      ...(q.channel ? { channel: q.channel } : {}),
      ...(q.delegateId ? { delegateId: q.delegateId } : {}),
      ...(q.contactId ? { contactId: q.contactId } : {}),
      ...(q.search ? { search: q.search } : {}),
      ...(q.limit ? { limit: q.limit } : {}),
    })
    return c.json({ items: items.map(toPreview) }, 200)
  })
  .openapi(detail, async (c) => {
    const d = await getConversationDetail(await actorCtx(c), messaging(), c.req.valid('param').id)
    return c.json(
      {
        ...d,
        serviceWindow: {
          ...d.serviceWindow,
          expiresAt: d.serviceWindow.expiresAt?.toISOString() ?? null,
        },
      },
      200,
    )
  })
  .openapi(thread, async (c) => {
    const items = await listThreadMessages(await actorCtx(c), c.req.valid('param').id)
    return c.json({ items: items.map(toMessage) }, 200)
  })
  .openapi(send, async (c) => {
    const { id } = c.req.valid('param')
    const { message, failureReason } = await sendMessage(await actorCtx(c), messaging(), {
      conversationId: id,
      text: c.req.valid('json').text,
    })
    // The reason of a rejected send is not stored: it goes to the log with the request's id.
    if (failureReason)
      c.get('log').warn({ conversationId: id, failureReason }, 'message send failed')
    return c.json(toMessage(message), 201)
  })
  .openapi(typing, async (c) => {
    const { id } = c.req.valid('param')
    const result = await signalTyping(await actorCtx(c), messaging(), id)
    if (result.status === 'FAILED')
      c.get('log').warn({ conversationId: id, error: result.error }, 'typing indicator failed')
    return c.body(null, 204)
  })
  .openapi(read, async (c) => {
    await markConversationRead(await actorCtx(c), c.req.valid('param').id)
    return c.body(null, 204)
  })
