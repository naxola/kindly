import { newId, withTenant } from '@saas/database'
import { afterAll, describe, expect, it } from 'vitest'
import {
  assignContactToDelegate,
  connectMessagingAccount,
  createContact,
  createMessagingRegistry,
  createTask,
  FakeMessagingAdapter,
  getConversationDetail,
  getTask,
  listTasks,
  processWebhookEvent,
  receiveWebhook,
  signalTyping,
  updateTask,
  type Ctx,
} from '../src/index.ts'
import { adminWithOrg, codeOf, db, joinMember, queue, type Org } from './helpers.ts'

afterAll(async () => {
  await db.$disconnect()
})

const open = new FakeMessagingAdapter('s3cret') // typing, no service window
const windowed = new FakeMessagingAdapter('s3cret', { channel: 'wa', serviceWindowHours: 24 })
const quiet = new FakeMessagingAdapter('s3cret', { channel: 'quiet' }) // no typing indicator
const broken = new FakeMessagingAdapter('s3cret', { channel: 'broken' }) // typing fails
;(quiet as { sendTypingIndicator?: unknown }).sendTypingIndicator = undefined
broken.sendTypingIndicator = () => Promise.reject(new Error('provider is down'))
const registry = createMessagingRegistry([open, windowed, quiet, broken])
const deps = () => ({ db, queue, registry, correlationId: newId() })
const adapters = { fake: open, wa: windowed, quiet, broken }

/** An account of `ctx`'s person, and a conversation on it started by an inbound message. */
async function conversationOf(
  org: Org,
  ctx: Ctx,
  channel: keyof typeof adapters = 'fake',
  occurredAt?: string,
  name = 'Marta',
) {
  const account = await connectMessagingAccount(ctx, registry, { channel })
  const externalMessageId = `m-${newId()}`
  const outcome = await receiveWebhook(
    deps(),
    channel,
    account.id,
    JSON.stringify({
      kind: 'MESSAGE',
      externalConversationId: `chat-${newId()}`,
      externalMessageId,
      externalContactId: `ext-${newId()}`,
      contactDisplayName: name,
      text: 'Hola',
      ...(occurredAt ? { occurredAt } : {}),
    }),
    adapters[channel].signatureHeaders(),
  )
  if (outcome.status !== 200) throw new Error('webhook rejected')
  await processWebhookEvent({ db, registry }, org.organization.id, outcome.webhookEventId)
  const conversation = await withTenant(db, org.organization.id, (tx) =>
    tx.conversation.findFirstOrThrow({ where: { messagingAccountId: account.id } }),
  )
  return { account, conversation, externalMessageId }
}

describe('"typing…" while the delegate writes', () => {
  it('goes through the owner’s account, anchored to the contact’s latest message', async () => {
    const admin = await adminWithOrg()
    const luis = await joinMember(admin, 'Luis')
    const { conversation, externalMessageId } = await conversationOf(admin, luis.ctx)
    const before = open.typingSignals.length
    expect(await signalTyping(luis.ctx, registry, conversation.id)).toEqual({ status: 'SENT' })
    expect(open.typingSignals.slice(before)).toEqual([
      { conversationId: conversation.id, replyToExternalMessageId: externalMessageId },
    ])
  })

  it('nobody signals from the number of someone else, not even an administrator', async () => {
    const admin = await adminWithOrg()
    const luis = await joinMember(admin, 'Luis')
    const { conversation } = await conversationOf(admin, luis.ctx)
    const before = open.typingSignals.length
    expect(await codeOf(signalTyping(admin.ctx, registry, conversation.id))).toEqual({
      code: 'FORBIDDEN',
      detail: 'NOT_ACCOUNT_OWNER',
    })
    expect(open.typingSignals.length).toBe(before)
  })

  it('skips it when the channel has no indicator or the service window is closed', async () => {
    const admin = await adminWithOrg()
    const luis = await joinMember(admin, 'Luis')
    const noIndicator = await conversationOf(admin, luis.ctx, 'quiet')
    expect(await signalTyping(luis.ctx, registry, noIndicator.conversation.id)).toEqual({
      status: 'SKIPPED',
      reason: 'UNSUPPORTED',
    })
    const old = new Date(Date.now() - 3 * 86_400_000).toISOString()
    const closed = await conversationOf(admin, luis.ctx, 'wa', old)
    const before = windowed.typingSignals.length
    expect(await signalTyping(luis.ctx, registry, closed.conversation.id)).toEqual({
      status: 'SKIPPED',
      reason: 'WINDOW_CLOSED',
    })
    expect(windowed.typingSignals.length).toBe(before)
  })

  it('a provider that fails does not fail the call, and the error is returned to be logged', async () => {
    const admin = await adminWithOrg()
    const luis = await joinMember(admin, 'Luis')
    const { conversation } = await conversationOf(admin, luis.ctx, 'broken')
    expect(await signalTyping(luis.ctx, registry, conversation.id)).toEqual({
      status: 'FAILED',
      error: 'provider is down',
    })
  })

  it('a conversation of another organization does not exist', async () => {
    const a = await adminWithOrg()
    const b = await adminWithOrg()
    const { conversation } = await conversationOf(a, a.ctx)
    expect(await codeOf(signalTyping(b.ctx, registry, conversation.id))).toMatchObject({
      code: 'NOT_FOUND',
    })
  })
})

describe('the conversation detail', () => {
  it('says whether the channel supports "typing…" and who attends the contact now', async () => {
    const admin = await adminWithOrg('Ana')
    const luis = await joinMember(admin, 'Luis')
    const { conversation } = await conversationOf(admin, luis.ctx)
    const before = await getConversationDetail(luis.ctx, registry, conversation.id)
    expect(before).toMatchObject({
      supportsTyping: true,
      referenceDelegateName: 'Luis',
      canReply: true,
    })
    // The administrator reassigns the contact: the conversation stays on Luis's number, but now
    // someone else attends the contact.
    await assignContactToDelegate(admin.ctx, conversation.contactId, admin.ctx.actor.memberId)
    const after = await getConversationDetail(luis.ctx, registry, conversation.id)
    expect(after).toMatchObject({
      referenceDelegateName: 'Ana',
      referenceDelegateId: admin.ctx.actor.memberId,
      account: { delegateName: 'Luis' },
    })
    const quietConversation = await conversationOf(admin, luis.ctx, 'quiet')
    expect(
      (await getConversationDetail(luis.ctx, registry, quietConversation.conversation.id))
        .supportsTyping,
    ).toBe(false)
  })
})

describe('tasks born in a conversation', () => {
  it('takes the contact from the conversation and is listed under that contact', async () => {
    const admin = await adminWithOrg()
    const { conversation } = await conversationOf(admin, admin.ctx)
    const task = await createTask(admin.ctx, {
      title: 'Pedir el justificante',
      conversationId: conversation.id,
    })
    expect(task).toMatchObject({
      conversationId: conversation.id,
      contact: { id: conversation.contactId },
    })
    const other = await createContact(admin.ctx, { name: 'Otro' })
    await createTask(admin.ctx, { title: 'De otro', contactId: other.id })
    const mine = await listTasks(admin.ctx, { contactId: conversation.contactId })
    expect(mine.map((t) => t.title)).toEqual(['Pedir el justificante'])
    expect((await listTasks(admin.ctx, { contactId: other.id, status: 'pending' })).length).toBe(1)
  })

  it('refuses a conversation about another contact, and one that does not exist or is not visible', async () => {
    const a = await adminWithOrg()
    const b = await adminWithOrg()
    const luis = await joinMember(a, 'Luis')
    const { conversation } = await conversationOf(a, a.ctx) // the admin's own, hidden from Luis
    const stranger = await createContact(a.ctx, { name: 'Otra persona' })
    expect(
      await codeOf(
        createTask(a.ctx, { title: 'X', contactId: stranger.id, conversationId: conversation.id }),
      ),
    ).toEqual({ code: 'VALIDATION_FAILED', detail: 'CONVERSATION_CONTACT_MISMATCH' })
    for (const [ctx, id] of [
      [b.ctx, conversation.id],
      [luis.ctx, conversation.id],
      [a.ctx, newId()],
    ] as const) {
      expect(await codeOf(createTask(ctx, { title: 'X', conversationId: id }))).toEqual({
        code: 'VALIDATION_FAILED',
        detail: 'INVALID_CONVERSATION',
      })
    }
  })

  it('an edit that leaves the conversation out keeps the link, until the task changes contact', async () => {
    const admin = await adminWithOrg()
    const { conversation } = await conversationOf(admin, admin.ctx)
    const task = await createTask(admin.ctx, { title: 'Llamar', conversationId: conversation.id })
    const renamed = await updateTask(admin.ctx, task.id, {
      title: 'Llamar hoy',
      contactId: conversation.contactId,
      completed: false,
    })
    expect(renamed.conversationId).toBe(conversation.id)
    const moved = await createContact(admin.ctx, { name: 'Otro' })
    const away = await updateTask(admin.ctx, task.id, {
      title: 'Llamar hoy',
      contactId: moved.id,
      completed: false,
    })
    expect(away).toMatchObject({ conversationId: null, contact: { id: moved.id } })
    // Explicitly clearing it also works.
    const again = await updateTask(admin.ctx, task.id, {
      title: 'x',
      contactId: conversation.contactId,
      conversationId: conversation.id,
      completed: false,
    })
    expect(again.conversationId).toBe(conversation.id)
    const cleared = await updateTask(admin.ctx, task.id, {
      title: 'x',
      contactId: conversation.contactId,
      conversationId: null,
      completed: false,
    })
    expect((await getTask(admin.ctx, task.id)).conversationId).toBeNull()
    expect(cleared.contact?.id).toBe(conversation.contactId)
  })

  it('the database itself refuses a task pointing at a conversation of another organization', async () => {
    const a = await adminWithOrg()
    const b = await adminWithOrg()
    const { conversation } = await conversationOf(b, b.ctx)
    await expect(
      withTenant(db, a.organization.id, (tx) =>
        tx.task.create({
          data: {
            organizationId: a.organization.id,
            title: 'Cruzada',
            conversationId: conversation.id,
          },
        }),
      ),
    ).rejects.toThrow(/foreign key|Foreign key/i)
  })
})
