import { withTenant } from '@saas/database'
import type { Ctx } from '../../context.ts'
import { DomainError } from '../../errors.ts'
import { recordActivity } from '../activity/index.ts'
import { writeAudit } from '../audit/index.ts'
import { assertConversationVisible } from '../conversations/index.ts'
import { authorize } from '../identity/index.ts'
import { isMediaExpired, readAttachment, safeContentType, safeDownloadName } from './attachments.ts'
import type { MessagingRegistry } from './port.ts'

export interface OpenedMedia {
  body: ReadableStream<Uint8Array>
  contentType: string
  contentLength: number | null
  filename: string
}

/** By name, not `instanceof`: a production bundle may hold more than one copy of a module. */
const isNamed = (error: unknown, name: string) => error instanceof Error && error.name === name

const unavailable = (code: 'MEDIA_EXPIRED' | 'MEDIA_UNAVAILABLE') =>
  new DomainError('NOT_FOUND', 'The file is no longer available at the provider', [{ code }])

/**
 * Opens the file a message carries, for the download proxy: the provider's bytes are handed back
 * as a stream that the caller pipes to the person's browser. **Nothing is written** (no disk,
 * storage, database, log or cache): Kindly keeps no copy of the affiliates' files.
 *
 * Access is the conversation's own: one the person may not see does not exist for them. Each
 * download is recorded (activity and audit: who opened which file), never its content.
 */
export async function openMessageMedia(
  ctx: Ctx,
  registry: MessagingRegistry,
  conversationId: string,
  messageId: string,
): Promise<OpenedMedia> {
  authorize(ctx.actor, 'conversations.read')
  const found = await withTenant(ctx.db, ctx.actor.organizationId, async (tx) => {
    await assertConversationVisible(tx, ctx, conversationId)
    const message = await tx.message.findFirst({
      where: { id: messageId, conversationId, deletedAt: null },
      include: { messagingAccount: true, conversation: { select: { channel: true } } },
    })
    const attachment = readAttachment(message?.attachment)
    if (!message || !attachment) throw new DomainError('NOT_FOUND', 'File not found')
    const adapter = registry.get(message.conversation.channel)
    if (!adapter?.downloadMedia) throw unavailable('MEDIA_UNAVAILABLE')
    if (isMediaExpired(message.createdAt, adapter.capabilities.inboundMediaDays, ctx.now?.())) {
      throw unavailable('MEDIA_EXPIRED')
    }
    await recordActivity(tx, {
      organizationId: ctx.actor.organizationId,
      type: 'MESSAGE_MEDIA_DOWNLOADED',
      actorMemberId: ctx.actor.memberId,
      entityType: 'conversation',
      entityId: conversationId,
      metadata: { messageId, kind: attachment.kind },
    })
    await writeAudit(tx, {
      organizationId: ctx.actor.organizationId,
      actorUserId: ctx.actor.userId,
      action: 'message.media_downloaded',
      resourceType: 'message',
      resourceId: messageId,
      correlationId: ctx.correlationId,
      ip: ctx.ip,
    })
    return { attachment, account: message.messagingAccount, adapter }
  })

  let media
  try {
    media = await found.adapter.downloadMedia!(found.account, found.attachment)
  } catch (error) {
    if (isNamed(error, 'MediaUnavailableError')) throw unavailable('MEDIA_EXPIRED')
    if (isNamed(error, 'MediaTooLargeError')) {
      throw new DomainError('PAYLOAD_TOO_LARGE', 'The file is too large to download from here', [
        { code: 'MEDIA_TOO_LARGE' },
      ])
    }
    throw error
  }
  const mimeType = media.contentType ?? found.attachment.mimeType
  return {
    body: media.body,
    contentType: safeContentType(mimeType),
    contentLength: media.contentLength,
    filename: safeDownloadName({ ...found.attachment, mimeType }),
  }
}
