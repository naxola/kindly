import { Prisma, withTenant, type MessageDeliveryStatus, type TenantTx } from '@saas/database'
import type { Ctx } from '../../context.ts'
import { DomainError } from '../../errors.ts'
import { visibleContactIds } from '../contacts/index.ts'
import { authorize } from '../identity/index.ts'
import { isConversationUnread } from './domain.ts'

/**
 * The inbox (docs/ui/INBOX.md): one list of conversations with the last message of each, filters,
 * four views and their counters. Raw SQL on purpose (`LEFT JOIN LATERAL` fetches exactly one
 * message row per conversation, in the database, and does the filtering and ordering there instead
 * of loading every message). It runs inside `withTenant`, so RLS still applies, and it restricts to
 * the contacts the actor may see with the same rule as everywhere else (`visibleContactIds`).
 */

/**
 * `pending`: the contact spoke last (the primary "needs attention" signal; not the same as unread,
 * since a conversation can be read and still await a reply). `unread`: the last message is newer
 * than the last time the conversation was opened. `unassigned`: the contact was auto-created and not
 * yet confirmed.
 */
export type InboxView = 'pending' | 'unread' | 'unassigned' | 'all'
export const INBOX_VIEWS: readonly InboxView[] = ['pending', 'unread', 'unassigned', 'all']

export interface InboxFilters {
  view?: InboxView
  channel?: string
  /** organization_members.id of the delegate who owns the account. */
  delegateId?: string
  /** One contact's conversations (the "other conversations" of its profile). */
  contactId?: string
  /** Matches the contact's name or phone, or the text of the last message. */
  search?: string
  limit?: number
}

export interface ConversationPreview {
  id: string
  contactId: string
  contactName: string
  contactIsUnassigned: boolean
  channel: string
  /** Owner of the conversation's account (whose phone it lives on). */
  delegateId: string
  /**
   * The contact's CURRENT reference delegate, not necessarily the account's: a contact several
   * delegates write to has one conversation per delegate and all carry the same reference. Null only
   * for a contact that was never assigned.
   */
  referenceDelegateId: string | null
  lastMessage: {
    body: string
    direction: 'INBOUND' | 'OUTBOUND'
    createdAt: Date
    deliveryStatus: MessageDeliveryStatus
    sentFromDevice: boolean
  } | null
  unread: boolean
}

interface Row {
  id: string
  contact_id: string
  contact_name: string
  is_unassigned: boolean
  channel: string
  delegate_id: string
  reference_delegate_id: string | null
  last_read_at: Date | null
  lm_id: string | null
  lm_body: string | null
  lm_direction: 'INBOUND' | 'OUTBOUND' | null
  lm_created_at: Date | null
  lm_delivery_status: MessageDeliveryStatus | null
  lm_sent_from_device: boolean | null
}

const MAX_LIMIT = 200
const DEFAULT_LIMIT = 100

/** Escapes LIKE wildcards: a search for "50%" must not match everything. */
const escapeLike = (s: string) => s.replace(/[\\%_]/g, (c) => `\\${c}`)

const FROM = Prisma.sql`
  FROM conversations conv
  JOIN contacts c ON c.id = conv.contact_id
  JOIN messaging_accounts ma ON ma.id = conv.messaging_account_id
  LEFT JOIN contact_assignments ref ON ref.contact_id = c.id AND ref.ended_at IS NULL
  LEFT JOIN LATERAL (
    SELECT m.id, m.body, m.direction, m.created_at, m.delivery_status, m.sent_from_device
    FROM messages m WHERE m.conversation_id = conv.id
    ORDER BY m.created_at DESC LIMIT 1
  ) lm ON true`

function scope(
  ctx: Ctx,
  visible: string[] | null,
  f: Pick<InboxFilters, 'channel' | 'delegateId' | 'contactId' | 'search'>,
) {
  const where: Prisma.Sql[] = [Prisma.sql`conv.organization_id = ${ctx.actor.organizationId}::uuid`]
  if (visible) where.push(Prisma.sql`c.id = ANY(${visible}::uuid[])`)
  if (f.channel) where.push(Prisma.sql`conv.channel = ${f.channel}`)
  if (f.delegateId) where.push(Prisma.sql`ma.delegate_id = ${f.delegateId}::uuid`)
  if (f.contactId) where.push(Prisma.sql`conv.contact_id = ${f.contactId}::uuid`)
  if (f.search?.trim()) {
    const like = `%${escapeLike(f.search.trim())}%`
    where.push(Prisma.sql`(c.name ILIKE ${like} OR c.phone ILIKE ${like} OR lm.body ILIKE ${like})`)
  }
  return where
}

const viewCondition = (view: InboxView): Prisma.Sql | null => {
  switch (view) {
    case 'pending':
      return Prisma.sql`lm.direction = 'INBOUND'`
    case 'unread':
      // A real last message is required: a message-less conversation would otherwise read as
      // "never read" by the bare rule.
      return Prisma.sql`(lm.id IS NOT NULL AND (conv.last_read_at IS NULL OR lm.created_at > conv.last_read_at))`
    case 'unassigned':
      return Prisma.sql`c.is_unassigned = true`
    case 'all':
      return null
  }
}

const whereOf = (parts: (Prisma.Sql | null)[]) =>
  Prisma.sql`WHERE ${Prisma.join(
    parts.filter((p): p is Prisma.Sql => p !== null),
    ' AND ',
  )}`

/** Conversations the actor may see, newest activity first. */
export async function listConversations(
  ctx: Ctx,
  filters: InboxFilters = {},
): Promise<ConversationPreview[]> {
  authorize(ctx.actor, 'conversations.read')
  const limit = Math.min(Math.max(filters.limit ?? DEFAULT_LIMIT, 1), MAX_LIMIT)
  return withTenant(ctx.db, ctx.actor.organizationId, async (tx) => {
    const visible = await visibleContactIds(tx, ctx.actor)
    const rows = await tx.$queryRaw<Row[]>(Prisma.sql`
      SELECT conv.id, conv.contact_id, c.name AS contact_name, c.is_unassigned, conv.channel,
             ma.delegate_id, ref.delegate_id AS reference_delegate_id, conv.last_read_at,
             lm.id AS lm_id, lm.body AS lm_body, lm.direction AS lm_direction,
             lm.created_at AS lm_created_at, lm.delivery_status AS lm_delivery_status,
             lm.sent_from_device AS lm_sent_from_device
      ${FROM}
      ${whereOf([...scope(ctx, visible, filters), viewCondition(filters.view ?? 'all')])}
      -- A reply moves its conversation to the top, like a chat list. coalesce: a bare DESC sorts
      -- NULLs first in Postgres, which would pin every message-less conversation above real activity.
      ORDER BY coalesce(lm.created_at, conv.created_at) DESC, conv.id DESC
      LIMIT ${limit}`)
    return rows.map((r) => ({
      id: r.id,
      contactId: r.contact_id,
      contactName: r.contact_name,
      contactIsUnassigned: r.is_unassigned,
      channel: r.channel,
      delegateId: r.delegate_id,
      referenceDelegateId: r.reference_delegate_id,
      lastMessage: r.lm_id
        ? {
            body: r.lm_body!,
            direction: r.lm_direction!,
            createdAt: r.lm_created_at!,
            deliveryStatus: r.lm_delivery_status!,
            sentFromDevice: r.lm_sent_from_device!,
          }
        : null,
      unread: isConversationUnread(r.lm_created_at, r.last_read_at),
    }))
  })
}

export type InboxCounts = Record<InboxView, number>

/**
 * Counters of the four views. They answer "how many, ignoring the search box": channel and
 * delegate narrow which mailbox is being counted; free text does not (a folder count does not
 * react to what is typed in the search bar).
 */
export async function countConversations(
  ctx: Ctx,
  filters: Pick<InboxFilters, 'channel' | 'delegateId'> = {},
): Promise<InboxCounts> {
  authorize(ctx.actor, 'conversations.read')
  return withTenant(ctx.db, ctx.actor.organizationId, async (tx) => {
    const visible = await visibleContactIds(tx, ctx.actor)
    const [row] = await tx.$queryRaw<
      { pending: bigint; unread: bigint; unassigned: bigint; all: bigint }[]
    >(Prisma.sql`
      SELECT
        count(*) FILTER (WHERE ${viewCondition('pending')}) AS pending,
        count(*) FILTER (WHERE ${viewCondition('unread')}) AS unread,
        count(*) FILTER (WHERE ${viewCondition('unassigned')}) AS unassigned,
        count(*) AS "all"
      ${FROM}
      ${whereOf(scope(ctx, visible, filters))}`)
    return {
      pending: Number(row?.pending ?? 0),
      unread: Number(row?.unread ?? 0),
      unassigned: Number(row?.unassigned ?? 0),
      all: Number(row?.all ?? 0),
    }
  })
}

/** Channels with at least one conversation the actor may see (the channel filter's options). */
export async function listConversationChannels(ctx: Ctx): Promise<string[]> {
  authorize(ctx.actor, 'conversations.read')
  return withTenant(ctx.db, ctx.actor.organizationId, async (tx) => {
    const visible = await visibleContactIds(tx, ctx.actor)
    const rows = await tx.$queryRaw<{ channel: string }[]>(Prisma.sql`
      SELECT DISTINCT conv.channel ${FROM}
      ${whereOf(scope(ctx, visible, {}))}
      ORDER BY conv.channel`)
    return rows.map((r) => r.channel)
  })
}

/** A conversation the actor may see, or NOT_FOUND (indistinguishable from one that does not exist). */
export async function assertConversationVisible(tx: TenantTx, ctx: Ctx, conversationId: string) {
  const visible = await visibleContactIds(tx, ctx.actor)
  const conversation = await tx.conversation.findFirst({
    where: { id: conversationId, ...(visible ? { contactId: { in: visible } } : {}) },
  })
  if (!conversation) throw new DomainError('NOT_FOUND', 'Conversation not found')
  return conversation
}

/**
 * Marks a conversation read, now. Opening it is the whole point of this call. One shared marker per
 * organization (no per-user read state in the MVP).
 */
export async function markConversationRead(ctx: Ctx, conversationId: string): Promise<void> {
  authorize(ctx.actor, 'conversations.read')
  await withTenant(ctx.db, ctx.actor.organizationId, async (tx) => {
    await assertConversationVisible(tx, ctx, conversationId)
    await tx.conversation.update({
      where: { id: conversationId },
      data: { lastReadAt: ctx.now?.() ?? new Date() },
    })
  })
}
