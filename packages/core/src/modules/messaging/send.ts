import { withTenant, type Conversation, type Message, type TenantTx } from '@saas/database'
import { z } from 'zod'
import type { Ctx } from '../../context.ts'
import { DomainError } from '../../errors.ts'
import { recordActivity } from '../activity/index.ts'
import { writeAudit } from '../audit/index.ts'
import { getServiceWindowState, type ServiceWindowState } from '../conversations/index.ts'
import { authorize } from '../identity/index.ts'
import { describeAccountStatus } from './domain.ts'
import type { MessagingRegistry } from './port.ts'

/** WhatsApp's limit for a text message; the other channels accept at least that. */
export const SendMessageInput = z.object({
  conversationId: z.uuid(),
  text: z.string().trim().min(1).max(4096),
})
export type SendMessageInput = z.input<typeof SendMessageInput>

/**
 * Service window of a conversation, against what its channel's adapter declares (never a provider
 * name). A channel with no adapter in this process has no window to ask: NOT_APPLICABLE is honest,
 * since sending is impossible without an adapter anyway.
 */
export async function getConversationServiceWindow(
  tx: TenantTx,
  registry: MessagingRegistry,
  conversation: Pick<Conversation, 'id' | 'channel'>,
  now: Date,
): Promise<ServiceWindowState> {
  const adapter = registry.get(conversation.channel)
  if (!adapter) return { status: 'NOT_APPLICABLE', expiresAt: null }
  const lastInbound = await tx.message.findFirst({
    where: { conversationId: conversation.id, direction: 'INBOUND' },
    orderBy: { createdAt: 'desc' },
    select: { createdAt: true },
  })
  return getServiceWindowState(
    lastInbound?.createdAt ?? null,
    adapter.capabilities.serviceWindowHours,
    now,
  )
}

/**
 * Sends a reply from Kindly. **Only the delegate who owns the conversation's account can do it, and
 * it always goes out through that account** (product principle 1): "Ana sees Luis's history read
 * only; if she answers, it is always from her own number". This is enforced here, not left to the UI
 * hiding the composer.
 *
 * A closed service window is refused (the provider would reject it anyway) instead of recording a
 * message that never left. A send the provider rejects is stored as FAILED, visible in the thread
 * where the delegate wrote it; the reason is returned (and logged by the caller), not persisted.
 */
export async function sendMessage(
  ctx: Ctx,
  registry: MessagingRegistry,
  input: SendMessageInput,
): Promise<{ message: Message; failureReason: string | null }> {
  authorize(ctx.actor, 'messages.send')
  const { conversationId, text } = SendMessageInput.parse(input)
  const now = ctx.now?.() ?? new Date()

  const { conversation, account } = await withTenant(
    ctx.db,
    ctx.actor.organizationId,
    async (tx) => {
      const conversation = await tx.conversation.findUnique({
        where: { id: conversationId },
        include: { messagingAccount: true },
      })
      if (!conversation) throw new DomainError('NOT_FOUND', 'Conversation not found')
      const account = conversation.messagingAccount
      if (account.delegateId !== ctx.actor.memberId) {
        throw new DomainError('FORBIDDEN', 'Only the delegate who owns this channel can reply', [
          { code: 'NOT_ACCOUNT_OWNER' },
        ])
      }
      if (!describeAccountStatus(account.status).operational) {
        throw new DomainError('CONFLICT', 'The channel is not connected', [
          { code: 'ACCOUNT_NOT_OPERATIONAL' },
        ])
      }
      const adapter = registry.get(conversation.channel)
      if (!adapter) {
        throw new DomainError('VALIDATION_FAILED', 'Unknown channel', [
          { path: 'channel', code: 'UNKNOWN_CHANNEL' },
        ])
      }
      const window = await getConversationServiceWindow(tx, registry, conversation, now)
      if (window.status === 'CLOSED') {
        throw new DomainError('CONFLICT', "The provider's messaging window is closed", [
          { code: 'SERVICE_WINDOW_CLOSED' },
        ])
      }
      return { conversation, account }
    },
  )

  // The provider call happens outside any transaction: it is a network call that can be slow.
  const adapter = registry.get(conversation.channel)!
  const result = await adapter.sendMessage(account, conversation, { text })

  return withTenant(ctx.db, ctx.actor.organizationId, async (tx) => {
    // The provider's echo of this very message (coexistence) can land before this insert commits
    // and then own the row, mislabelled as written on the phone. A message that went through here
    // was composed in Kindly: correct that flag, and nothing else (a DELIVERED/READ callback may
    // already have overtaken us).
    const { count } = await tx.message.createMany({
      data: {
        organizationId: ctx.actor.organizationId,
        conversationId: conversation.id,
        messagingAccountId: account.id,
        externalMessageId: result.externalMessageId,
        direction: 'OUTBOUND',
        sentFromDevice: false,
        body: text,
        deliveryStatus: result.deliveryStatus === 'FAILED' ? 'FAILED' : 'SENT',
      },
      skipDuplicates: true,
    })
    if (count === 0) {
      await tx.message.updateMany({
        where: {
          messagingAccountId: account.id,
          externalMessageId: result.externalMessageId,
        },
        data: { sentFromDevice: false },
      })
    }
    const message = await tx.message.findUniqueOrThrow({
      where: {
        messagingAccountId_externalMessageId: {
          messagingAccountId: account.id,
          externalMessageId: result.externalMessageId,
        },
      },
    })
    await recordActivity(tx, {
      organizationId: ctx.actor.organizationId,
      type: 'MESSAGE_SENT',
      actorMemberId: ctx.actor.memberId,
      entityType: 'conversation',
      entityId: conversation.id,
      metadata: { messageId: message.id },
    })
    // Ids and the outcome only: the text of a message is personal data.
    await writeAudit(tx, {
      organizationId: ctx.actor.organizationId,
      actorUserId: ctx.actor.userId,
      action: 'message.sent',
      resourceType: 'message',
      resourceId: message.id,
      after: { conversationId: conversation.id, status: result.deliveryStatus },
      correlationId: ctx.correlationId,
      ip: ctx.ip,
    })
    return { message, failureReason: result.failureReason ?? null }
  })
}

/** How often the composer may ask for a "typing…" signal: the provider shows it for a few seconds. */
export const TYPING_INDICATOR_THROTTLE_MS = 20_000

export type TypingSignalResult =
  | { status: 'SENT' }
  /** Nothing to do: the channel has no indicator, the window is closed or the contact has not written. */
  | { status: 'SKIPPED'; reason: 'UNSUPPORTED' | 'WINDOW_CLOSED' | 'NO_INBOUND_MESSAGE' }
  /** The provider rejected it. Never fatal: the indicator is a courtesy. */
  | { status: 'FAILED'; error: string }

/**
 * Shows "typing…" to the contact while the delegate writes a reply, anchored to the contact's latest
 * inbound message. Same rule as sending: only the owner of the account, from their own account. A
 * provider error does not fail the call (it is returned so the caller can log it).
 */
export async function signalTyping(
  ctx: Ctx,
  registry: MessagingRegistry,
  conversationId: string,
): Promise<TypingSignalResult> {
  authorize(ctx.actor, 'messages.send')
  const now = ctx.now?.() ?? new Date()
  const found = await withTenant(ctx.db, ctx.actor.organizationId, async (tx) => {
    const conversation = await tx.conversation.findUnique({
      where: { id: conversationId },
      include: { messagingAccount: true },
    })
    if (!conversation) throw new DomainError('NOT_FOUND', 'Conversation not found')
    const account = conversation.messagingAccount
    if (account.delegateId !== ctx.actor.memberId) {
      throw new DomainError('FORBIDDEN', 'Only the delegate who owns this channel can reply', [
        { code: 'NOT_ACCOUNT_OWNER' },
      ])
    }
    const adapter = registry.get(conversation.channel)
    if (!adapter?.sendTypingIndicator || !describeAccountStatus(account.status).operational) {
      return { kind: 'skip' as const, reason: 'UNSUPPORTED' as const }
    }
    // Outside the window the provider would reject it, and no reply is on its way: the composer is
    // not offered then either.
    const window = await getConversationServiceWindow(tx, registry, conversation, now)
    if (window.status === 'CLOSED')
      return { kind: 'skip' as const, reason: 'WINDOW_CLOSED' as const }
    const lastInbound = await tx.message.findFirst({
      where: { conversationId, direction: 'INBOUND' },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      select: { externalMessageId: true },
    })
    if (!lastInbound) return { kind: 'skip' as const, reason: 'NO_INBOUND_MESSAGE' as const }
    return {
      kind: 'go' as const,
      conversation,
      account,
      adapter,
      replyTo: lastInbound.externalMessageId,
    }
  })
  if (found.kind === 'skip') return { status: 'SKIPPED', reason: found.reason }

  try {
    // Outside any transaction: a network call.
    await found.adapter.sendTypingIndicator!(found.account, found.conversation, found.replyTo)
    return { status: 'SENT' }
  } catch (error) {
    return { status: 'FAILED', error: error instanceof Error ? error.message : String(error) }
  }
}
