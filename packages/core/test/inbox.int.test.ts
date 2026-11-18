import { newId, withTenant } from '@saas/database'
import { afterAll, describe, expect, it } from 'vitest'
import {
  assignContactToDelegate,
  connectMessagingAccount,
  countConversations,
  createMessagingRegistry,
  FakeMessagingAdapter,
  listConversationChannels,
  listConversations,
  markConversationRead,
  processWebhookEvent,
  receiveWebhook,
  sendMessage,
  type Ctx,
} from '../src/index.ts'
import { adminWithOrg, codeOf, db, joinMember, queue, type Org } from './helpers.ts'

afterAll(async () => {
  await db.$disconnect()
})

const fake = new FakeMessagingAdapter('s3cret')
const other = new FakeMessagingAdapter('s3cret', { channel: 'other' })
const registry = createMessagingRegistry([fake, other])
const deps = () => ({ db, queue, registry, correlationId: newId() })

async function account(ctx: Ctx, channel = 'fake') {
  return (await connectMessagingAccount(ctx, registry, { channel })).id
}

/** A chat started by `name` on `accountId`, at `iso` (the message the contact wrote). */
async function chat(
  org: Org,
  accountId: string,
  name: string,
  iso: string,
  opts: { channel?: string; text?: string; kind?: string; phone?: string } = {},
) {
  const adapter = opts.channel === 'other' ? other : fake
  const outcome = await receiveWebhook(
    deps(),
    opts.channel ?? 'fake',
    accountId,
    JSON.stringify({
      kind: opts.kind ?? 'MESSAGE',
      externalConversationId: `chat-${name}`,
      externalMessageId: `m-${newId()}`,
      externalContactId: `ext-${name}`,
      contactDisplayName: name,
      contactPhone: opts.phone ?? null,
      text: opts.text ?? `Hola soy ${name}`,
      occurredAt: iso,
    }),
    adapter.signatureHeaders(),
  )
  if (outcome.status !== 200) throw new Error('rejected')
  await processWebhookEvent({ db, registry }, org.organization.id, outcome.webhookEventId)
}

const names = async (ctx: Ctx, f: Parameters<typeof listConversations>[1] = {}) =>
  (await listConversations(ctx, f)).map((c) => c.contactName)

describe('the list', () => {
  it('shows the last message of each conversation, newest activity first', async () => {
    const admin = await adminWithOrg()
    const id = await account(admin.ctx)
    await chat(admin, id, 'Ana', '2026-03-01T10:00:00.000Z')
    await chat(admin, id, 'Beto', '2026-03-03T10:00:00.000Z')
    await chat(admin, id, 'Carla', '2026-03-02T10:00:00.000Z')
    await chat(admin, id, 'Ana', '2026-03-04T10:00:00.000Z', { text: 'Otra cosa' }) // Ana moves up
    const list = await listConversations(admin.ctx)
    expect(list.map((c) => c.contactName)).toEqual(['Ana', 'Beto', 'Carla'])
    expect(list[0]).toMatchObject({
      channel: 'fake',
      contactIsUnassigned: true,
      delegateId: admin.ctx.actor.memberId,
      referenceDelegateId: admin.ctx.actor.memberId,
      unread: true,
      lastMessage: { body: 'Otra cosa', direction: 'INBOUND', sentFromDevice: false },
    })
  })

  it('a reply moves the conversation to the top and makes it no longer pending', async () => {
    const admin = await adminWithOrg()
    const id = await account(admin.ctx)
    await chat(admin, id, 'Ana', '2026-03-01T10:00:00.000Z')
    await chat(admin, id, 'Beto', '2026-03-02T10:00:00.000Z')
    const [ana] = (await listConversations(admin.ctx)).filter((c) => c.contactName === 'Ana')
    await sendMessage(admin.ctx, registry, { conversationId: ana!.id, text: 'Hola Ana' })
    expect(await names(admin.ctx)).toEqual(['Ana', 'Beto'])
    expect(await names(admin.ctx, { view: 'pending' })).toEqual(['Beto'])
  })

  it('searches name, phone and the last message text, escaping wildcards', async () => {
    const admin = await adminWithOrg()
    const id = await account(admin.ctx)
    await chat(admin, id, 'Marta Gil', '2026-03-01T10:00:00.000Z', { phone: '+34600111222' })
    await chat(admin, id, 'Pedro', '2026-03-02T10:00:00.000Z', { text: 'Descuento del 50% hoy' })
    await chat(admin, id, 'Lucía', '2026-03-03T10:00:00.000Z', { text: 'Todo bien' })
    expect(await names(admin.ctx, { search: 'marta' })).toEqual(['Marta Gil'])
    expect(await names(admin.ctx, { search: '600111' })).toEqual(['Marta Gil'])
    expect(await names(admin.ctx, { search: 'descuento' })).toEqual(['Pedro'])
    // A literal "%" is not "match everything"; "_" is not "any character".
    expect(await names(admin.ctx, { search: '50%' })).toEqual(['Pedro'])
    expect(await names(admin.ctx, { search: '%' })).toEqual(['Pedro'])
    expect(await names(admin.ctx, { search: 'L_cía' })).toEqual([])
  })

  it('filters by channel, by delegate of the account and by contact, and limits', async () => {
    const admin = await adminWithOrg()
    const luis = await joinMember(admin, 'Luis')
    const a = await account(admin.ctx)
    const l = await account(luis.ctx, 'other')
    await chat(admin, a, 'Del admin', '2026-03-01T10:00:00.000Z')
    await chat(admin, l, 'De Luis', '2026-03-02T10:00:00.000Z', { channel: 'other' })
    expect(await names(admin.ctx, { channel: 'other' })).toEqual(['De Luis'])
    expect(await names(admin.ctx, { delegateId: admin.ctx.actor.memberId })).toEqual(['Del admin'])
    const [luisConv] = await listConversations(admin.ctx, { channel: 'other' })
    expect(await names(admin.ctx, { contactId: luisConv!.contactId })).toEqual(['De Luis'])
    expect(await listConversations(admin.ctx, { limit: 1 })).toHaveLength(1)
    expect(await listConversationChannels(admin.ctx)).toEqual(['fake', 'other'])
  })
})

describe('views and counters', () => {
  it('pending, unread, unassigned and all, with matching counters', async () => {
    const admin = await adminWithOrg()
    const id = await account(admin.ctx)
    await chat(admin, id, 'Ana', '2026-03-01T10:00:00.000Z')
    await chat(admin, id, 'Beto', '2026-03-02T10:00:00.000Z')
    await chat(admin, id, 'Carla', '2026-03-03T10:00:00.000Z')
    const convOf = async (name: string) =>
      (await listConversations(admin.ctx)).find((c) => c.contactName === name)!

    // Ana is read; Beto got an answer; Carla is untouched.
    await markConversationRead(admin.ctx, (await convOf('Ana')).id)
    await sendMessage(admin.ctx, registry, {
      conversationId: (await convOf('Beto')).id,
      text: 'ok',
    })
    // Beto's reply is the newest activity; as in a chat list it also counts as unread until opened.
    expect(await names(admin.ctx, { view: 'unread' })).toEqual(['Beto', 'Carla'])
    expect(await names(admin.ctx, { view: 'pending' })).toEqual(['Carla', 'Ana'])
    expect(await names(admin.ctx, { view: 'all' })).toHaveLength(3)
    expect(await countConversations(admin.ctx)).toEqual({
      pending: 2,
      unread: 2,
      unassigned: 3,
      all: 3,
    })
    // The search box never changes the counters; the channel narrows them.
    expect((await countConversations(admin.ctx, { channel: 'nope' })).all).toBe(0)
  })

  it('a conversation with no messages is never unread nor pending', async () => {
    const admin = await adminWithOrg()
    const id = await account(admin.ctx)
    await chat(admin, id, 'Ana', '2026-03-01T10:00:00.000Z')
    await withTenant(db, admin.organization.id, (tx) => tx.message.deleteMany())
    expect(await names(admin.ctx, { view: 'unread' })).toEqual([])
    expect(await names(admin.ctx, { view: 'pending' })).toEqual([])
    expect(await names(admin.ctx)).toEqual(['Ana'])
  })

  it('history imported as read stays out of unread, a live message after it is unread', async () => {
    const admin = await adminWithOrg()
    const id = await account(admin.ctx)
    await chat(admin, id, 'Ana', '2026-01-10T10:00:00.000Z', { kind: 'HISTORY_MESSAGE' })
    expect(await names(admin.ctx, { view: 'unread' })).toEqual([])
    await chat(admin, id, 'Ana', '2026-06-01T10:00:00.000Z')
    expect(await names(admin.ctx, { view: 'unread' })).toEqual(['Ana'])
  })
})

describe('what each person sees', () => {
  it('a delegate sees only their contacts conversations; the admin sees all', async () => {
    const admin = await adminWithOrg()
    const luis = await joinMember(admin, 'Luis')
    const eva = await joinMember(admin, 'Eva')
    await chat(admin, await account(luis.ctx), 'De Luis', '2026-03-01T10:00:00.000Z')
    await chat(admin, await account(eva.ctx), 'De Eva', '2026-03-02T10:00:00.000Z')
    expect(await names(luis.ctx)).toEqual(['De Luis'])
    expect(await names(eva.ctx)).toEqual(['De Eva'])
    expect(await names(admin.ctx)).toEqual(['De Eva', 'De Luis'])
    expect(await countConversations(luis.ctx)).toMatchObject({ all: 1 })
    expect(await listConversationChannels(luis.ctx)).toEqual(['fake'])
  })

  it('reassigning moves the conversation, and temporary access shows it to the one written to', async () => {
    const admin = await adminWithOrg()
    const luis = await joinMember(admin, 'Luis')
    const ana = await joinMember(admin, 'Ana')
    const luisAccount = await account(luis.ctx)
    const anaAccount = await account(ana.ctx)
    await chat(admin, luisAccount, 'Marta', '2026-03-01T10:00:00.000Z')
    const [conv] = await listConversations(luis.ctx)
    expect(await names(ana.ctx)).toEqual([])
    // Marta writes to Ana's number too (same contact, her own conversation): temporary access.
    await withTenant(db, admin.organization.id, async (tx) => {
      const c = await tx.conversation.create({
        data: {
          organizationId: admin.organization.id,
          messagingAccountId: anaAccount,
          contactId: conv!.contactId,
          channel: 'fake',
          externalConversationId: 'marta-on-ana',
        },
      })
      await tx.message.create({
        data: {
          organizationId: admin.organization.id,
          conversationId: c.id,
          messagingAccountId: anaAccount,
          externalMessageId: 'x1',
          direction: 'INBOUND',
          body: 'Hola Ana',
          createdAt: new Date('2026-03-02T09:00:00.000Z'),
        },
      })
    })
    // Ana now sees Marta's conversations (both of them, with the full history).
    expect(await names(ana.ctx)).toEqual(['Marta', 'Marta'])
    // The admin reassigns Marta to Ana for good: Luis loses her.
    await assignContactToDelegate(admin.ctx, conv!.contactId, ana.ctx.actor.memberId)
    expect(await names(luis.ctx)).toEqual([])
    expect(await names(ana.ctx)).toHaveLength(2)
  })

  it('opening or reading what is not visible looks like it does not exist', async () => {
    const admin = await adminWithOrg()
    const luis = await joinMember(admin, 'Luis')
    await chat(admin, await account(admin.ctx), 'Del admin', '2026-03-01T10:00:00.000Z')
    const [conv] = await listConversations(admin.ctx)
    expect(await codeOf(markConversationRead(luis.ctx, conv!.id))).toMatchObject({
      code: 'NOT_FOUND',
    })
    expect(await codeOf(markConversationRead(luis.ctx, newId()))).toMatchObject({
      code: 'NOT_FOUND',
    })
  })
})

describe('tenant isolation', () => {
  it('one organization never lists, counts or reads the conversations of another', async () => {
    const a = await adminWithOrg()
    const b = await adminWithOrg()
    await chat(a, await account(a.ctx), 'De A', '2026-03-01T10:00:00.000Z')
    const [conv] = await listConversations(a.ctx)
    expect(await listConversations(b.ctx)).toEqual([])
    expect(await countConversations(b.ctx)).toEqual({
      pending: 0,
      unread: 0,
      unassigned: 0,
      all: 0,
    })
    expect(await listConversationChannels(b.ctx)).toEqual([])
    expect(await codeOf(markConversationRead(b.ctx, conv!.id))).toMatchObject({ code: 'NOT_FOUND' })
  })
})
