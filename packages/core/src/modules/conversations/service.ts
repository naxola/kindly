import type {
  Conversation,
  Message,
  MessageDeliveryStatus,
  MessageDirection,
  MessagingAccount,
  TenantTx,
} from '@saas/database'
import { createContactFromInbound } from '../contacts/index.ts'
import { shouldApplyDeliveryStatus } from './domain.ts'

/**
 * Persistence of threads and messages, used by the webhook pipeline (module messaging). They all
 * take the caller's tenant transaction: a whole webhook is processed atomically and idempotently,
 * so a retry after a failure never duplicates anything. They do not authorize: the caller is the
 * system acting for an account, not a person.
 */

export interface InboundContactInfo {
  externalContactId: string
  displayName?: string | null
  phone?: string | null
}

/**
 * Finds the conversation of an external chat on an account, creating it (and a minimal contact,
 * assigned to the account's delegate) when it is the first message ever seen of that chat.
 *
 * Concurrent webhooks for the same brand-new chat are serialized with an advisory lock on
 * (account, chat): the second one waits and then finds the first one's conversation, instead of
 * both inserting and one aborting the transaction on the unique index.
 */
export async function findOrCreateConversation(
  tx: TenantTx,
  account: MessagingAccount,
  externalConversationId: string,
  contact: InboundContactInfo,
): Promise<Conversation> {
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${`${account.id}:${externalConversationId}`}, 0))`
  const existing = await tx.conversation.findUnique({
    where: {
      messagingAccountId_externalConversationId: {
        messagingAccountId: account.id,
        externalConversationId,
      },
    },
  })
  if (existing) return existing
  const created = await createContactFromInbound(tx, {
    organizationId: account.organizationId,
    delegateMemberId: account.delegateId,
    name: contact.displayName || contact.phone || contact.externalContactId,
    phone: contact.phone ?? null,
  })
  return tx.conversation.create({
    data: {
      organizationId: account.organizationId,
      messagingAccountId: account.id,
      contactId: created.id,
      channel: account.channel,
      externalConversationId,
    },
  })
}

export type MessageOrigin = 'INBOUND' | 'ECHO' | 'HISTORY'

export interface RecordMessageInput {
  conversation: Conversation
  account: MessagingAccount
  externalMessageId: string
  body: string
  sourceWebhookEventId: string
  occurredAt: Date
  /**
   * INBOUND: the contact wrote (delivered). ECHO: the delegate wrote it on their own phone and the
   * provider echoed it back (outbound, sent from device). HISTORY: replayed from the past, in
   * either `direction` (an outbound one is always from the device: it predates the connection).
   */
  origin: MessageOrigin
  direction?: MessageDirection
}

/**
 * Inserts a message idempotently: `(account, external message id)` is unique and a duplicate does
 * nothing (`created: false`), which absorbs a redelivered webhook and, for echoes, a message Kindly
 * itself sent coming straight back. The caller uses `created` to avoid logging the activity twice.
 */
export async function recordMessage(
  tx: TenantTx,
  input: RecordMessageInput,
): Promise<{ created: boolean; message: Message | null }> {
  const direction: MessageDirection =
    input.origin === 'INBOUND'
      ? 'INBOUND'
      : input.origin === 'ECHO'
        ? 'OUTBOUND'
        : (input.direction ?? 'INBOUND')
  const deliveryStatus: MessageDeliveryStatus = direction === 'INBOUND' ? 'DELIVERED' : 'SENT'
  const { count } = await tx.message.createMany({
    data: {
      organizationId: input.account.organizationId,
      conversationId: input.conversation.id,
      messagingAccountId: input.account.id,
      externalMessageId: input.externalMessageId,
      direction,
      sentFromDevice: direction === 'OUTBOUND',
      body: input.body,
      deliveryStatus,
      sourceWebhookEventId: input.sourceWebhookEventId,
      createdAt: input.occurredAt,
      updatedAt: input.occurredAt,
    },
    skipDuplicates: true,
  })
  if (count === 0) return { created: false, message: null }
  const message = await tx.message.findUniqueOrThrow({
    where: {
      messagingAccountId_externalMessageId: {
        messagingAccountId: input.account.id,
        externalMessageId: input.externalMessageId,
      },
    },
  })
  return { created: true, message }
}

/** Applies a provider status callback to the matching message; never creates one, never goes backwards. */
export async function applyDeliveryUpdate(
  tx: TenantTx,
  messagingAccountId: string,
  externalMessageId: string,
  next: 'SENT' | 'DELIVERED' | 'READ' | 'FAILED',
): Promise<void> {
  const current = await tx.message.findUnique({
    where: { messagingAccountId_externalMessageId: { messagingAccountId, externalMessageId } },
    select: { id: true, deliveryStatus: true },
  })
  if (!current || !shouldApplyDeliveryStatus(current.deliveryStatus, next)) return
  await tx.message.update({ where: { id: current.id }, data: { deliveryStatus: next } })
}

/**
 * Marks a conversation read up to `readAt` and no further: importing 180 days of history must not
 * land in the inbox as a wall of unread threads, but anything genuinely newer stays unread. Never
 * moves the marker backwards.
 */
export async function markConversationReadUpTo(
  tx: TenantTx,
  conversationId: string,
  readAt: Date,
): Promise<void> {
  await tx.conversation.updateMany({
    where: {
      id: conversationId,
      OR: [{ lastReadAt: null }, { lastReadAt: { lt: readAt } }],
    },
    data: { lastReadAt: readAt },
  })
}
