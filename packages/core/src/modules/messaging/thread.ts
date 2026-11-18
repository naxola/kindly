import { withTenant, type MessageDeliveryStatus, type MessagingAccountStatus } from '@saas/database'
import type { Ctx } from '../../context.ts'
import { assertConversationVisible, type ServiceWindowState } from '../conversations/index.ts'
import { authorize } from '../identity/index.ts'
import { displayNamesOf } from '../team/index.ts'
import {
  attachmentPlaceholder,
  isMediaExpired,
  readAttachment,
  type AttachmentKind,
} from './attachments.ts'
import { describeAccountStatus } from './domain.ts'
import type { MessagingRegistry } from './port.ts'
import { getConversationServiceWindow } from './send.ts'

export interface ConversationDetail {
  id: string
  channel: string
  contact: { id: string; name: string; phone: string | null; isUnassigned: boolean }
  /** The account the conversation lives on: whose phone it is. */
  account: { id: string; delegateId: string; delegateName: string; status: MessagingAccountStatus }
  /** The contact's current reference delegate (may differ from the account's owner). */
  referenceDelegateId: string | null
  /** Name of the reference delegate (who "now attends" the contact), when there is one. */
  referenceDelegateName: string | null
  /** Whether the channel can show "typing…" to the contact (only meaningful if `canReply`). */
  supportsTyping: boolean
  serviceWindow: ServiceWindowState
  /**
   * Whether THIS person can reply right now: they own the account, it is connected, its channel has
   * an adapter here and the service window is not closed. When false the composer is read-only
   * (e.g. Ana reading Luis's history: she answers from her own number only).
   */
  canReply: boolean
}

export async function getConversationDetail(
  ctx: Ctx,
  registry: MessagingRegistry,
  conversationId: string,
): Promise<ConversationDetail> {
  authorize(ctx.actor, 'conversations.read')
  return withTenant(ctx.db, ctx.actor.organizationId, async (tx) => {
    const base = await assertConversationVisible(tx, ctx, conversationId)
    const conversation = await tx.conversation.findUniqueOrThrow({
      where: { id: base.id },
      include: {
        contact: { include: { assignments: { where: { endedAt: null }, take: 1 } } },
        messagingAccount: true,
      },
    })
    const account = conversation.messagingAccount
    const referenceDelegateId = conversation.contact.assignments[0]?.delegateId ?? null
    const names = await displayNamesOf(
      tx,
      referenceDelegateId ? [account.delegateId, referenceDelegateId] : [account.delegateId],
    )
    const serviceWindow = await getConversationServiceWindow(
      tx,
      registry,
      conversation,
      ctx.now?.() ?? new Date(),
    )
    const owns = account.delegateId === ctx.actor.memberId
    return {
      id: conversation.id,
      channel: conversation.channel,
      contact: {
        id: conversation.contact.id,
        name: conversation.contact.name,
        phone: conversation.contact.phone,
        isUnassigned: conversation.contact.isUnassigned,
      },
      account: {
        id: account.id,
        delegateId: account.delegateId,
        delegateName: names.get(account.delegateId) ?? '',
        status: account.status,
      },
      referenceDelegateId,
      referenceDelegateName: referenceDelegateId ? (names.get(referenceDelegateId) ?? null) : null,
      supportsTyping: !!registry.get(conversation.channel)?.sendTypingIndicator,
      serviceWindow,
      canReply:
        owns &&
        describeAccountStatus(account.status).operational &&
        registry.get(conversation.channel) !== null &&
        serviceWindow.status !== 'CLOSED',
    }
  })
}

export interface ThreadAttachment {
  kind: AttachmentKind
  filename: string | null
  mimeType: string | null
  /** False once the provider no longer serves the file (or the channel cannot download). */
  downloadable: boolean
  /** Whether the message text is the sender's caption (false: it is only the file's placeholder). */
  captioned: boolean
}

export interface ThreadMessage {
  id: string
  direction: 'INBOUND' | 'OUTBOUND'
  body: string
  deliveryStatus: MessageDeliveryStatus
  sentFromDevice: boolean
  createdAt: Date
  /** The file the message carries: what it is, never the provider's handle. */
  attachment: ThreadAttachment | null
}

const THREAD_LIMIT = 500

/** The last messages of a visible conversation, oldest first (so the thread reads top to bottom). */
export async function listThreadMessages(
  ctx: Ctx,
  conversationId: string,
  /** To know how long the channel serves files; without it no file is offered for download. */
  registry?: MessagingRegistry,
): Promise<ThreadMessage[]> {
  authorize(ctx.actor, 'conversations.read')
  return withTenant(ctx.db, ctx.actor.organizationId, async (tx) => {
    const conversation = await assertConversationVisible(tx, ctx, conversationId)
    const adapter = registry?.get(conversation.channel)
    const mediaDays = adapter?.downloadMedia ? adapter.capabilities.inboundMediaDays : null
    const now = ctx.now?.() ?? new Date()
    const rows = await tx.message.findMany({
      where: { conversationId, deletedAt: null },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: THREAD_LIMIT,
      select: {
        id: true,
        direction: true,
        body: true,
        deliveryStatus: true,
        sentFromDevice: true,
        createdAt: true,
        attachment: true,
      },
    })
    return rows.reverse().map(({ attachment: raw, ...m }) => {
      const a = readAttachment(raw)
      return {
        ...m,
        attachment: a
          ? {
              kind: a.kind,
              filename: a.filename,
              mimeType: a.mimeType,
              downloadable: !isMediaExpired(m.createdAt, mediaDays, now),
              captioned: m.body !== attachmentPlaceholder(a),
            }
          : null,
      }
    })
  })
}
