import { newId, withTenant } from '@saas/database'
import { afterAll, describe, expect, it } from 'vitest'
import { ZodError } from 'zod'
import {
  connectMessagingAccount,
  createMessagingRegistry,
  FakeMessagingAdapter,
  getConversationServiceWindow,
  processWebhookEvent,
  receiveWebhook,
  sendMessage,
  type Ctx,
} from '../src/index.ts'
import { adminWithOrg, codeOf, db, joinMember, queue, type Org } from './helpers.ts'

afterAll(async () => {
  await db.$disconnect()
})

const open = new FakeMessagingAdapter('s3cret') // no window
const windowed = new FakeMessagingAdapter('s3cret', { channel: 'wa', serviceWindowHours: 24 })
const registry = createMessagingRegistry([open, windowed])
const deps = () => ({ db, queue, registry, correlationId: newId() })

/** An account of `ctx`'s person, and a conversation on it created by an inbound message. */
async function conversationOf(org: Org, ctx: Ctx, channel = 'fake', occurredAt?: string) {
  const adapter = channel === 'wa' ? windowed : open
  const account = await connectMessagingAccount(ctx, registry, { channel })
  const body = JSON.stringify({
    kind: 'MESSAGE',
    externalConversationId: `chat-${newId()}`,
    externalMessageId: `m-${newId()}`,
    externalContactId: 'ext',
    contactDisplayName: 'Marta',
    text: 'Hola',
    ...(occurredAt ? { occurredAt } : {}),
  })
  const outcome = await receiveWebhook(
    deps(),
    channel,
    account.id,
    body,
    adapter.signatureHeaders(),
  )
  if (outcome.status !== 200) throw new Error('webhook rejected')
  await processWebhookEvent({ db, registry }, org.organization.id, outcome.webhookEventId)
  const conversation = await withTenant(db, org.organization.id, (tx) =>
    tx.conversation.findFirstOrThrow({ where: { messagingAccountId: account.id } }),
  )
  return { account, conversation }
}

const tenant = <T>(org: Org, fn: Parameters<typeof withTenant<T>>[2]) =>
  withTenant(db, org.organization.id, fn)

describe('identity: only the account owner replies, through that account', () => {
  it('sends from the owner and records the message, the activity and an audit without the text', async () => {
    const admin = await adminWithOrg()
    const luis = await joinMember(admin, 'Luis')
    const { account, conversation } = await conversationOf(admin, luis.ctx)
    const { message, failureReason } = await sendMessage(luis.ctx, registry, {
      conversationId: conversation.id,
      text: '  Te llamo mañana  ',
    })
    expect(failureReason).toBeNull()
    expect(message).toMatchObject({
      direction: 'OUTBOUND',
      sentFromDevice: false,
      deliveryStatus: 'SENT',
      body: 'Te llamo mañana',
      messagingAccountId: account.id,
    })
    expect(open.sentMessages.at(-1)?.account.id).toBe(account.id)
    await tenant(admin, async (tx) => {
      const sent = await tx.activity.findFirstOrThrow({ where: { type: 'MESSAGE_SENT' } })
      expect(sent.actorId).toBe(luis.ctx.actor.memberId)
      const audit = await tx.auditLog.findFirstOrThrow({ where: { action: 'message.sent' } })
      expect(JSON.stringify(audit)).not.toContain('Te llamo')
    })
  })

  it('refuses anyone else, an administrator included: nobody answers from another delegate`s number', async () => {
    const admin = await adminWithOrg()
    const luis = await joinMember(admin, 'Luis')
    const ana = await joinMember(admin, 'Ana')
    const { conversation } = await conversationOf(admin, luis.ctx)
    const notOwner = { code: 'FORBIDDEN', detail: 'NOT_ACCOUNT_OWNER' }
    expect(
      await codeOf(
        sendMessage(ana.ctx, registry, { conversationId: conversation.id, text: 'hola' }),
      ),
    ).toEqual(notOwner)
    expect(
      await codeOf(
        sendMessage(admin.ctx, registry, { conversationId: conversation.id, text: 'hola' }),
      ),
    ).toEqual(notOwner)
    expect(
      await tenant(admin, (tx) => tx.message.count({ where: { direction: 'OUTBOUND' } })),
    ).toBe(0)
  })

  it('a conversation of another organization does not exist', async () => {
    const a = await adminWithOrg()
    const b = await adminWithOrg()
    const { conversation } = await conversationOf(a, a.ctx)
    expect(
      await codeOf(sendMessage(b.ctx, registry, { conversationId: conversation.id, text: 'x' })),
    ).toMatchObject({ code: 'NOT_FOUND' })
    expect(
      await codeOf(sendMessage(b.ctx, registry, { conversationId: newId(), text: 'x' })),
    ).toMatchObject({ code: 'NOT_FOUND' })
  })

  it('validates the text and the state of the channel', async () => {
    const admin = await adminWithOrg()
    const { account, conversation } = await conversationOf(admin, admin.ctx)
    await expect(
      sendMessage(admin.ctx, registry, { conversationId: conversation.id, text: '   ' }),
    ).rejects.toBeInstanceOf(ZodError)
    await tenant(admin, (tx) =>
      tx.messagingAccount.update({ where: { id: account.id }, data: { status: 'DISCONNECTED' } }),
    )
    expect(
      await codeOf(
        sendMessage(admin.ctx, registry, { conversationId: conversation.id, text: 'hola' }),
      ),
    ).toEqual({ code: 'CONFLICT', detail: 'ACCOUNT_NOT_OPERATIONAL' })
  })

  it('refuses a channel this process has no adapter for', async () => {
    const admin = await adminWithOrg()
    const { conversation } = await conversationOf(admin, admin.ctx)
    expect(
      await codeOf(
        sendMessage(admin.ctx, createMessagingRegistry([]), {
          conversationId: conversation.id,
          text: 'hola',
        }),
      ),
    ).toEqual({ code: 'VALIDATION_FAILED', detail: 'UNKNOWN_CHANNEL' })
  })
})

describe('service window', () => {
  const at = (ctx: Ctx, iso: string): Ctx => ({ ...ctx, now: () => new Date(iso) })

  it('is open for 24 h after the last INBOUND message and closed after', async () => {
    const admin = await adminWithOrg()
    const { conversation } = await conversationOf(
      admin,
      admin.ctx,
      'wa',
      '2026-05-01T10:00:00.000Z',
    )
    const send = (ctx: Ctx) =>
      sendMessage(ctx, registry, { conversationId: conversation.id, text: 'hola' })
    expect((await send(at(admin.ctx, '2026-05-02T09:59:00.000Z'))).message.deliveryStatus).toBe(
      'SENT',
    )
    expect(await codeOf(send(at(admin.ctx, '2026-05-02T10:01:00.000Z')))).toEqual({
      code: 'CONFLICT',
      detail: 'SERVICE_WINDOW_CLOSED',
    })
  })

  it('is never extended by what the delegate writes (outbound does not open the window)', async () => {
    const admin = await adminWithOrg()
    const { conversation } = await conversationOf(
      admin,
      admin.ctx,
      'wa',
      '2026-05-01T10:00:00.000Z',
    )
    // A later outbound message exists, but the window counts from the contact's last message.
    await tenant(admin, (tx) =>
      tx.message.create({
        data: {
          organizationId: admin.organization.id,
          conversationId: conversation.id,
          messagingAccountId: conversation.messagingAccountId,
          externalMessageId: 'late-out',
          direction: 'OUTBOUND',
          body: 'x',
          createdAt: new Date('2026-05-02T09:00:00.000Z'),
        },
      }),
    )
    const state = await tenant(admin, (tx) =>
      getConversationServiceWindow(
        tx,
        registry,
        conversation,
        new Date('2026-05-02T12:00:00.000Z'),
      ),
    )
    expect(state.status).toBe('CLOSED')
  })

  it('does not apply to a channel without a window or without an adapter', async () => {
    const admin = await adminWithOrg()
    const { conversation } = await conversationOf(admin, admin.ctx)
    const state = (reg = registry) =>
      tenant(admin, (tx) => getConversationServiceWindow(tx, reg, conversation, new Date()))
    expect((await state()).status).toBe('NOT_APPLICABLE')
    expect((await state(createMessagingRegistry([]))).status).toBe('NOT_APPLICABLE')
  })
})

describe('provider outcome', () => {
  it('stores a rejected send as FAILED and returns the reason without persisting it', async () => {
    const admin = await adminWithOrg()
    const { conversation } = await conversationOf(admin, admin.ctx)
    const rejecting = Object.assign(new FakeMessagingAdapter('s3cret'), {
      sendMessage: () =>
        Promise.resolve({
          externalMessageId: `failed-${newId()}`,
          deliveryStatus: 'FAILED' as const,
          failureReason: 'recipient not on WhatsApp',
        }),
    })
    const { message, failureReason } = await sendMessage(
      admin.ctx,
      createMessagingRegistry([rejecting]),
      { conversationId: conversation.id, text: 'hola' },
    )
    expect(message.deliveryStatus).toBe('FAILED')
    expect(failureReason).toBe('recipient not on WhatsApp')
    expect(JSON.stringify(message)).not.toContain('not on WhatsApp')
  })

  it('claims an echo that beat the insert: written in Kindly, so not "from the device", status untouched', async () => {
    const admin = await adminWithOrg()
    const { account, conversation } = await conversationOf(admin, admin.ctx)
    // The provider's echo of the message about to be sent landed first and already got READ.
    await tenant(admin, (tx) =>
      tx.message.create({
        data: {
          organizationId: admin.organization.id,
          conversationId: conversation.id,
          messagingAccountId: account.id,
          externalMessageId: 'echo-first',
          direction: 'OUTBOUND',
          sentFromDevice: true,
          body: 'hola',
          deliveryStatus: 'READ',
        },
      }),
    )
    open.nextExternalMessageId = 'echo-first'
    const { message } = await sendMessage(admin.ctx, registry, {
      conversationId: conversation.id,
      text: 'hola',
    })
    expect(message).toMatchObject({ sentFromDevice: false, deliveryStatus: 'READ' })
    expect(
      await tenant(admin, (tx) => tx.message.count({ where: { externalMessageId: 'echo-first' } })),
    ).toBe(1)
  })
})
