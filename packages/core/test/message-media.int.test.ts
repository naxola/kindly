import { newId, withTenant } from '@saas/database'
import { afterAll, describe, expect, it } from 'vitest'
import {
  connectMessagingAccount,
  createMessagingRegistry,
  FakeMessagingAdapter,
  listThreadMessages,
  openMessageMedia,
  processWebhookEvent,
  receiveWebhook,
  type Ctx,
} from '../src/index.ts'
import { adminWithOrg, codeOf, db, joinMember, queue, type Org } from './helpers.ts'

afterAll(async () => {
  await db.$disconnect()
})

const fake = new FakeMessagingAdapter('s3cret')
const registry = createMessagingRegistry([fake])

/** A file arrives on `ctx`'s own fake account; returns the conversation and message ids. */
async function fileFrom(org: Org, ctx: Ctx, mediaId: string, text?: string) {
  const accountId = (await connectMessagingAccount(ctx, registry, { channel: 'fake' })).id
  const outcome = await receiveWebhook(
    { db, queue, registry, correlationId: newId() },
    'fake',
    accountId,
    JSON.stringify({
      kind: 'MESSAGE',
      externalConversationId: `chat-${mediaId}`,
      externalMessageId: `m-${newId()}`,
      externalContactId: `ext-${mediaId}`,
      contactDisplayName: 'Marta',
      ...(text ? { text } : {}),
      attachment: { kind: 'DOCUMENT', mediaId, mimeType: 'application/pdf', filename: 'baja.pdf' },
    }),
    fake.signatureHeaders(),
  )
  if (outcome.status !== 200) throw new Error('webhook refused')
  await processWebhookEvent({ db, registry }, org.organization.id, outcome.webhookEventId)
  return withTenant(db, org.organization.id, (tx) =>
    tx.message.findFirstOrThrow({
      where: { messagingAccountId: accountId },
      select: { id: true, conversationId: true, body: true, attachment: true },
    }),
  )
}

describe('files in conversations', () => {
  it('a message keeps only the descriptor; the thread never shows the provider handle', async () => {
    const admin = await adminWithOrg()
    const msg = await fileFrom(admin, admin.ctx, 'media-ok')
    expect(msg.body).toBe('[Documento: baja.pdf]')
    expect(msg.attachment).toEqual({
      kind: 'DOCUMENT',
      mediaId: 'media-ok',
      mimeType: 'application/pdf',
      filename: 'baja.pdf',
    })
    const [item] = await listThreadMessages(admin.ctx, msg.conversationId, registry)
    expect(item!.attachment).toEqual({
      kind: 'DOCUMENT',
      filename: 'baja.pdf',
      mimeType: 'application/pdf',
      downloadable: true,
      captioned: false,
    })
    expect(JSON.stringify(item)).not.toContain('media-ok')
    // Without the channel's adapter nothing is offered for download.
    const [plain] = await listThreadMessages(admin.ctx, msg.conversationId)
    expect(plain!.attachment?.downloadable).toBe(false)
  })

  it('the download streams the bytes from the provider and records who opened it', async () => {
    const admin = await adminWithOrg()
    const msg = await fileFrom(admin, admin.ctx, 'media-stream', 'Mi parte')
    const file = await openMessageMedia(admin.ctx, registry, msg.conversationId, msg.id)
    expect(await new Response(file.body).text()).toBe('Contenido simulado del archivo media-stream')
    expect(file).toMatchObject({ contentType: 'application/pdf', filename: 'baja.pdf' })
    const activity = await withTenant(db, admin.organization.id, (tx) =>
      tx.activity.findMany({
        where: { type: 'MESSAGE_MEDIA_DOWNLOADED', entityId: msg.conversationId },
      }),
    )
    expect(activity).toHaveLength(1)
    // Nothing about the file was written: the message row is as the webhook left it.
    const after = await withTenant(db, admin.organization.id, (tx) =>
      tx.message.findUniqueOrThrow({
        where: { id: msg.id },
        select: { body: true, attachment: true },
      }),
    )
    expect(after).toEqual({ body: 'Mi parte', attachment: msg.attachment })
  })

  it('an expired or missing file, or a channel that cannot download, is refused', async () => {
    const admin = await adminWithOrg()
    const gone = await fileFrom(admin, admin.ctx, 'expired-at-provider')
    expect(
      await codeOf(openMessageMedia(admin.ctx, registry, gone.conversationId, gone.id)),
    ).toEqual({
      code: 'NOT_FOUND',
      detail: 'MEDIA_EXPIRED',
    })
    const old = await fileFrom(admin, admin.ctx, 'media-old')
    const later = { ...admin.ctx, now: () => new Date(Date.now() + 8 * 86_400_000) }
    expect(await codeOf(openMessageMedia(later, registry, old.conversationId, old.id))).toEqual({
      code: 'NOT_FOUND',
      detail: 'MEDIA_EXPIRED',
    })
    const [stale] = await listThreadMessages(later, old.conversationId, registry)
    expect(stale!.attachment?.downloadable).toBe(false)
    expect(
      await codeOf(
        openMessageMedia(admin.ctx, createMessagingRegistry([]), old.conversationId, old.id),
      ),
    ).toEqual({ code: 'NOT_FOUND', detail: 'MEDIA_UNAVAILABLE' })
  })

  it('someone who cannot see the conversation cannot open its files, nor another organization', async () => {
    const admin = await adminWithOrg()
    const luis = await joinMember(admin, 'Luis')
    const ana = await joinMember(admin, 'Ana')
    const msg = await fileFrom(admin, luis.ctx, 'media-private')
    expect(
      await codeOf(openMessageMedia(ana.ctx, registry, msg.conversationId, msg.id)),
    ).toMatchObject({
      code: 'NOT_FOUND',
    })
    const other = await adminWithOrg('Otra')
    expect(
      await codeOf(openMessageMedia(other.ctx, registry, msg.conversationId, msg.id)),
    ).toMatchObject({
      code: 'NOT_FOUND',
    })
    // Neither reached the provider.
    expect(fake.downloads.filter((a) => a.mediaId === 'media-private')).toHaveLength(0)
  })
})
