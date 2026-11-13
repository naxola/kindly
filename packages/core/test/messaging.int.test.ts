import { newId, withTenant } from '@saas/database'
import { afterAll, describe, expect, it } from 'vitest'
import {
  connectMessagingAccount,
  createMessagingRegistry,
  disconnectMessagingAccount,
  FakeMessagingAdapter,
  listContacts,
  listMessagingAccounts,
  processWebhookEvent,
  receiveWebhook,
  verifyWebhookSubscription,
  type Ctx,
} from '../src/index.ts'
import { adminWithOrg, codeOf, db, joinMember, queue, type Org } from './helpers.ts'

afterAll(async () => {
  await db.$disconnect()
})

const fake = new FakeMessagingAdapter('s3cret')
const registry = createMessagingRegistry([fake])
const deps = () => ({ db, queue, registry, correlationId: newId() })

/** An account of `ctx`'s person on the fake channel. */
async function account(ctx: Ctx) {
  const a = await connectMessagingAccount(ctx, registry, { channel: 'fake' })
  return a.id
}

async function send(
  accountId: string,
  events: object | object[],
  headers = fake.signatureHeaders(),
) {
  const outcome = await receiveWebhook(deps(), 'fake', accountId, JSON.stringify(events), headers)
  if (outcome.status !== 200) throw new Error(`webhook answered ${outcome.status}`)
  return outcome.webhookEventId
}

const process = (org: Org, eventId: string) =>
  processWebhookEvent({ db, registry }, org.organization.id, eventId)

const inbound = (over: Record<string, unknown> = {}) => ({
  kind: 'MESSAGE',
  externalConversationId: 'chat-1',
  externalMessageId: `m-${newId()}`,
  externalContactId: 'ext-marta',
  contactDisplayName: 'Marta Gil',
  contactPhone: '+34600111222',
  text: 'Hola',
  ...over,
})

const tenant = <T>(org: Org, fn: Parameters<typeof withTenant<T>>[2]) =>
  withTenant(db, org.organization.id, fn)

describe('receiving a webhook', () => {
  it('stores the verified event and enqueues its processing, idempotently keyed', async () => {
    const admin = await adminWithOrg()
    const id = await account(admin.ctx)
    const before = queue.of('messaging.process-webhook').length
    const eventId = await send(id, inbound())
    const stored = await tenant(admin, (tx) =>
      tx.webhookEvent.findUnique({ where: { id: eventId } }),
    )
    expect(stored).toMatchObject({ channel: 'fake', processedAt: null })
    expect(stored?.rawBody).toContain('Marta Gil')
    const jobs = queue.of('messaging.process-webhook')
    expect(jobs).toHaveLength(before + 1)
    expect(jobs.at(-1)?.options.idempotencyKey).toBe(`webhook:${eventId}`)
    expect(jobs.at(-1)?.options.organizationId).toBe(admin.organization.id)
  })

  it('rejects a bad signature before persisting anything', async () => {
    const admin = await adminWithOrg()
    const id = await account(admin.ctx)
    const outcome = await receiveWebhook(deps(), 'fake', id, '{}', { 'x-fake-signature': 'wrong' })
    expect(outcome).toEqual({ status: 401 })
    expect(await tenant(admin, (tx) => tx.webhookEvent.count())).toBe(0)
  })

  it('answers 404 without telling an unknown channel, account or malformed id apart', async () => {
    const admin = await adminWithOrg()
    const id = await account(admin.ctx)
    const headers = fake.signatureHeaders()
    expect(await receiveWebhook(deps(), 'nope', id, '{}', headers)).toEqual({ status: 404 })
    expect(await receiveWebhook(deps(), 'fake', newId(), '{}', headers)).toEqual({ status: 404 })
    expect(await receiveWebhook(deps(), 'fake', 'not-a-uuid', '{}', headers)).toEqual({
      status: 404,
    })
    const other = createMessagingRegistry([new FakeMessagingAdapter('x', { channel: 'other' })])
    expect(
      await receiveWebhook({ ...deps(), registry: other }, 'other', id, '{}', headers),
    ).toEqual({ status: 404 }) // the account exists, but on another channel
  })

  it('has no handshake unless the adapter defines one', async () => {
    const admin = await adminWithOrg()
    const id = await account(admin.ctx)
    expect(await verifyWebhookSubscription(deps(), 'fake', id, new URLSearchParams())).toEqual({
      status: 404,
    })
    const challenging = new FakeMessagingAdapter('s')
    challenging.verifyWebhookChallenge = (q) =>
      q.get('token') === 'ok' ? q.get('challenge') : null
    const reg = createMessagingRegistry([challenging])
    const d = { db, registry: reg }
    expect(
      await verifyWebhookSubscription(d, 'fake', id, new URLSearchParams('token=ok&challenge=abc')),
    ).toEqual({ status: 200, body: 'abc' })
    expect(await verifyWebhookSubscription(d, 'fake', id, new URLSearchParams('token=no'))).toEqual(
      {
        status: 403,
      },
    )
    expect(await verifyWebhookSubscription(d, 'fake', newId(), new URLSearchParams())).toEqual({
      status: 404,
    })
  })
})

describe('processing', () => {
  it('turns a message from an unknown sender into a contact, a conversation and a message', async () => {
    const admin = await adminWithOrg()
    const luis = await joinMember(admin, 'Luis')
    const id = await account(luis.ctx)
    const eventId = await send(id, inbound())
    await process(admin, eventId)
    await tenant(admin, async (tx) => {
      const contact = await tx.contact.findFirstOrThrow({ include: { assignments: true } })
      expect(contact).toMatchObject({
        name: 'Marta Gil',
        phone: '+34600111222',
        isUnassigned: true,
      })
      // Assigned to the delegate whose account received it, with no human actor.
      expect(contact.assignments).toMatchObject([
        { delegateId: luis.ctx.actor.memberId, assignedById: null, endedAt: null },
      ])
      const message = await tx.message.findFirstOrThrow({ include: { conversation: true } })
      expect(message).toMatchObject({
        direction: 'INBOUND',
        deliveryStatus: 'DELIVERED',
        sentFromDevice: false,
        body: 'Hola',
        conversation: { contactId: contact.id, externalConversationId: 'chat-1' },
      })
      const types = (await tx.activity.findMany()).map((a) => [a.type, a.entityType])
      expect(types).toContainEqual(['MESSAGE_RECEIVED', 'conversation'])
      const event = await tx.webhookEvent.findUniqueOrThrow({ where: { id: eventId } })
      expect(event.processedAt).not.toBeNull()
    })
  })

  it('names an unknown contact by phone, then by external id, never inventing a name', async () => {
    const admin = await adminWithOrg()
    const id = await account(admin.ctx)
    await process(
      admin,
      await send(id, [
        inbound({ externalConversationId: 'c-phone', contactDisplayName: null }),
        inbound({
          externalConversationId: 'c-ext',
          contactDisplayName: null,
          contactPhone: null,
          externalContactId: 'ext-77',
        }),
      ]),
    )
    const names = (await listContacts(admin.ctx)).map((c) => c.name).sort()
    expect(names).toEqual(['+34600111222', 'ext-77'])
  })

  it('is idempotent: the same event twice, or the same message in two webhooks, changes nothing', async () => {
    const admin = await adminWithOrg()
    const id = await account(admin.ctx)
    const message = inbound({ externalMessageId: 'dup-1' })
    const first = await send(id, message)
    await process(admin, first)
    await process(admin, first)
    await process(admin, await send(id, message))
    await tenant(admin, async (tx) => {
      expect(await tx.message.count()).toBe(1)
      expect(await tx.contact.count()).toBe(1)
      expect(await tx.activity.count({ where: { type: 'MESSAGE_RECEIVED' } })).toBe(1)
    })
  })

  it('keeps one contact per chat: later messages join the same conversation', async () => {
    const admin = await adminWithOrg()
    const id = await account(admin.ctx)
    await process(admin, await send(id, [inbound(), inbound({ text: 'otra vez' })]))
    await tenant(admin, async (tx) => {
      expect(await tx.contact.count()).toBe(1)
      expect(await tx.conversation.count()).toBe(1)
      expect(await tx.message.count()).toBe(2)
    })
  })

  it('stores an echo as outbound sent from the device, even when it is the first thing seen', async () => {
    const admin = await adminWithOrg()
    const id = await account(admin.ctx)
    await process(
      admin,
      await send(
        id,
        inbound({ kind: 'OUTBOUND_ECHO', externalMessageId: 'echo-1', text: 'Te llamo' }),
      ),
    )
    await tenant(admin, async (tx) => {
      expect(await tx.message.findFirstOrThrow()).toMatchObject({
        direction: 'OUTBOUND',
        sentFromDevice: true,
        deliveryStatus: 'SENT',
      })
      expect(await tx.contact.count()).toBe(1)
      expect((await tx.activity.findMany()).map((a) => a.type)).toContain(
        'MESSAGE_SENT_FROM_DEVICE',
      )
    })
  })

  it('absorbs the echo of a message Kindly sent itself (same external id)', async () => {
    const admin = await adminWithOrg()
    const id = await account(admin.ctx)
    await process(admin, await send(id, inbound({ externalMessageId: 'shared-id' })))
    await process(
      admin,
      await send(id, inbound({ kind: 'OUTBOUND_ECHO', externalMessageId: 'shared-id' })),
    )
    expect(await tenant(admin, (tx) => tx.message.count())).toBe(1)
  })

  it('imports history without marking it unread nor logging activity, but newer stays unread', async () => {
    const admin = await adminWithOrg()
    const id = await account(admin.ctx)
    const past = '2026-01-10T10:00:00.000Z'
    await process(
      admin,
      await send(id, [
        inbound({ kind: 'HISTORY_MESSAGE', externalMessageId: 'h1', occurredAt: past }),
        inbound({
          kind: 'HISTORY_MESSAGE',
          externalMessageId: 'h2',
          direction: 'OUTBOUND',
          occurredAt: '2026-01-10T10:05:00.000Z',
        }),
      ]),
    )
    await tenant(admin, async (tx) => {
      const messages = await tx.message.findMany({ orderBy: { createdAt: 'asc' } })
      expect(messages.map((m) => [m.direction, m.sentFromDevice, m.deliveryStatus])).toEqual([
        ['INBOUND', false, 'DELIVERED'],
        ['OUTBOUND', true, 'SENT'],
      ])
      // (connecting the account is the only activity: nothing about the imported thread)
      expect(await tx.activity.count({ where: { entityType: 'conversation' } })).toBe(0)
      const conversation = await tx.conversation.findFirstOrThrow()
      expect(conversation.lastReadAt?.toISOString()).toBe('2026-01-10T10:05:00.000Z')
    })
    // A live message later is newer than the read marker: unread.
    await process(
      admin,
      await send(
        id,
        inbound({ externalMessageId: 'live', occurredAt: '2026-06-01T00:00:00.000Z' }),
      ),
    )
    const c = await tenant(admin, (tx) => tx.conversation.findFirstOrThrow())
    expect(c.lastReadAt?.toISOString()).toBe('2026-01-10T10:05:00.000Z')
  })

  it('applies delivery updates without ever moving a status backwards', async () => {
    const admin = await adminWithOrg()
    const id = await account(admin.ctx)
    await process(
      admin,
      await send(id, inbound({ kind: 'OUTBOUND_ECHO', externalMessageId: 'out-1' })),
    )
    const status = () =>
      tenant(admin, async (tx) => (await tx.message.findFirstOrThrow()).deliveryStatus)
    const update = (deliveryStatus: string) =>
      send(id, { kind: 'DELIVERY_UPDATE', externalMessageId: 'out-1', deliveryStatus }).then((e) =>
        process(admin, e),
      )
    await update('READ')
    expect(await status()).toBe('READ')
    await update('DELIVERED') // late: must not undo the read
    expect(await status()).toBe('READ')
    await update('FAILED') // the phone already has it
    expect(await status()).toBe('READ')
    // An update for a message we never saw creates nothing.
    await send(id, {
      kind: 'DELIVERY_UPDATE',
      externalMessageId: 'ghost',
      deliveryStatus: 'READ',
    }).then((e) => process(admin, e))
    expect(await tenant(admin, (tx) => tx.message.count())).toBe(1)
  })

  it('records a disconnection that happened outside Kindly once', async () => {
    const admin = await adminWithOrg()
    const id = await account(admin.ctx)
    for (let i = 0; i < 2; i++) {
      await process(
        admin,
        await send(id, { kind: 'ACCOUNT_DISCONNECTED', reason: 'removed from the phone' }),
      )
    }
    await tenant(admin, async (tx) => {
      expect(await tx.messagingAccount.findUniqueOrThrow({ where: { id } })).toMatchObject({
        status: 'DISCONNECTED',
        lastError: 'removed from the phone',
      })
      const events = await tx.activity.findMany({ where: { type: 'CHANNEL_DISCONNECTED' } })
      expect(events).toHaveLength(1)
      expect(events[0]?.actorId).toBeNull()
    })
  })

  it('on failure records the error, keeps the event pending and rethrows for the retry', async () => {
    const admin = await adminWithOrg()
    const id = await account(admin.ctx)
    const eventId = await send(id, inbound()) // valid at first
    await tenant(admin, (tx) =>
      tx.webhookEvent.update({ where: { id: eventId }, data: { rawBody: '{not json' } }),
    )
    await expect(process(admin, eventId)).rejects.toThrow()
    const event = await tenant(admin, (tx) =>
      tx.webhookEvent.findUniqueOrThrow({ where: { id: eventId } }),
    )
    expect(event.processedAt).toBeNull()
    expect(event.processingError).toMatch(/JSON/i)
    // Fixed, the retry succeeds and clears the error.
    await tenant(admin, (tx) =>
      tx.webhookEvent.update({
        where: { id: eventId },
        data: { rawBody: JSON.stringify(inbound()) },
      }),
    )
    await process(admin, eventId)
    const done = await tenant(admin, (tx) =>
      tx.webhookEvent.findUniqueOrThrow({ where: { id: eventId } }),
    )
    expect(done).toMatchObject({ processingError: null })
    expect(done.processedAt).not.toBeNull()
  })

  it('rolls the whole webhook back when one of its events fails: no half applied batch', async () => {
    const admin = await adminWithOrg()
    const id = await account(admin.ctx)
    const eventId = await send(id, [inbound(), inbound({ externalMessageId: 'second' })])
    const broken = createMessagingRegistry([
      Object.assign(new FakeMessagingAdapter('s3cret'), {
        parseWebhookEvents() {
          return [
            {
              kind: 'MESSAGE',
              externalConversationId: 'c',
              externalMessageId: 'ok',
              externalContactId: 'x',
              text: 'a',
              occurredAt: new Date(),
            },
            {
              kind: 'MESSAGE',
              externalConversationId: 'c',
              externalMessageId: null,
              externalContactId: 'x',
              text: 'b',
              occurredAt: new Date(),
            },
          ] as never
        },
      }),
    ])
    await expect(
      processWebhookEvent({ db, registry: broken }, admin.organization.id, eventId),
    ).rejects.toThrow()
    await tenant(admin, async (tx) => {
      expect(await tx.message.count()).toBe(0)
      expect(await tx.contact.count()).toBe(0)
    })
  })
})

describe('tenant isolation', () => {
  it('a webhook of one organization never writes into another', async () => {
    const a = await adminWithOrg()
    const b = await adminWithOrg()
    const accountA = await account(a.ctx)
    await process(a, await send(accountA, inbound()))
    expect(await listContacts(b.ctx)).toHaveLength(0)
    expect(await tenant(b, (tx) => tx.message.count())).toBe(0)
    expect(await tenant(b, (tx) => tx.webhookEvent.count())).toBe(0)
    // Processing an event of A under B's tenant finds nothing.
    const eventId = await send(accountA, inbound({ externalMessageId: 'x' }))
    await process(b, eventId)
    expect(await tenant(a, (tx) => tx.webhookEvent.count({ where: { processedAt: null } }))).toBe(1)
  })
})

describe('accounts', () => {
  it('everyone connects and sees their own accounts; administrators see all', async () => {
    const admin = await adminWithOrg('Ana')
    const luis = await joinMember(admin, 'Luis')
    const own = await account(luis.ctx)
    const adminsOwn = await account(admin.ctx)
    expect((await listMessagingAccounts(luis.ctx)).map((a) => a.id)).toEqual([own])
    expect((await listMessagingAccounts(admin.ctx)).map((a) => a.id).sort()).toEqual(
      [own, adminsOwn].sort(),
    )
    const view = (await listMessagingAccounts(admin.ctx)).find((a) => a.id === own)!
    expect(view.delegateName).toBe('Luis')
    // The secret store pointer and provider metadata never reach callers.
    expect(view).not.toHaveProperty('credentialsReference')
    expect(view).not.toHaveProperty('metadata')
    expect(view).toMatchObject({ status: 'CONNECTED', delegateId: luis.ctx.actor.memberId })
  })

  it('refuses an unknown channel and a failing provider connection leaves nothing behind', async () => {
    const admin = await adminWithOrg()
    expect(await codeOf(connectMessagingAccount(admin.ctx, registry, { channel: 'nope' }))).toEqual(
      {
        code: 'VALIDATION_FAILED',
        detail: 'UNKNOWN_CHANNEL',
      },
    )
    fake.failNextConnect = 'provider said no'
    await expect(connectMessagingAccount(admin.ctx, registry, { channel: 'fake' })).rejects.toThrow(
      'provider said no',
    )
    expect(await listMessagingAccounts(admin.ctx)).toHaveLength(0)
  })

  it('a delegate disconnects their own; only an administrator disconnects someone else`s', async () => {
    const admin = await adminWithOrg()
    const luis = await joinMember(admin, 'Luis')
    const eva = await joinMember(admin, 'Eva')
    const luisAccount = await account(luis.ctx)
    expect(await codeOf(disconnectMessagingAccount(eva.ctx, registry, luisAccount))).toMatchObject({
      code: 'NOT_FOUND',
    })
    await disconnectMessagingAccount(luis.ctx, registry, luisAccount)
    const status = (id: string) =>
      tenant(
        admin,
        async (tx) => (await tx.messagingAccount.findUniqueOrThrow({ where: { id } })).status,
      )
    expect(await status(luisAccount)).toBe('DISCONNECTED')
    const evaAccount = await account(eva.ctx)
    await disconnectMessagingAccount(admin.ctx, registry, evaAccount)
    expect(await status(evaAccount)).toBe('DISCONNECTED')
  })

  it('refuses to disconnect a channel that can only be disconnected from the device', async () => {
    const admin = await adminWithOrg()
    const coexistence = new FakeMessagingAdapter('s', { channel: 'coex', canDisconnect: false })
    const reg = createMessagingRegistry([coexistence])
    const a = await connectMessagingAccount(admin.ctx, reg, { channel: 'coex' })
    expect(await codeOf(disconnectMessagingAccount(admin.ctx, reg, a.id))).toEqual({
      code: 'CONFLICT',
      detail: 'CANNOT_DISCONNECT_FROM_KINDLY',
    })
    const row = await tenant(admin, (tx) =>
      tx.messagingAccount.findUniqueOrThrow({ where: { id: a.id } }),
    )
    expect(row.status).toBe('CONNECTED')
  })
})

describe('temporary access (docs/DECISIONS.md, "Delegado de referencia y acceso temporal")', () => {
  /**
   * Marta is Luis's contact. She also writes to Ana's number. Ana sees her only until Marta and
   * Luis exchange a message, in either direction, after that.
   */
  async function scenario() {
    const admin = await adminWithOrg('Admin')
    const luis = await joinMember(admin, 'Luis')
    const ana = await joinMember(admin, 'Ana')
    const luisAccount = await account(luis.ctx)
    const anaAccount = await account(ana.ctx)
    // Marta arrives through Luis: his contact, assigned to him.
    await process(
      admin,
      await send(luisAccount, inbound({ occurredAt: '2026-03-01T10:00:00.000Z' })),
    )
    const marta = await tenant(admin, (tx) => tx.contact.findFirstOrThrow())
    const at = (iso: string) => new Date(iso)
    const write = (
      accountId: string,
      chat: string,
      direction: 'INBOUND' | 'OUTBOUND',
      iso: string,
    ) =>
      tenant(admin, async (tx) => {
        const conv =
          (await tx.conversation.findFirst({
            where: { messagingAccountId: accountId, contactId: marta.id },
          })) ??
          (await tx.conversation.create({
            data: {
              organizationId: admin.organization.id,
              messagingAccountId: accountId,
              contactId: marta.id,
              channel: 'fake',
              externalConversationId: chat,
            },
          }))
        await tx.message.create({
          data: {
            organizationId: admin.organization.id,
            conversationId: conv.id,
            messagingAccountId: accountId,
            externalMessageId: `x-${newId()}`,
            direction,
            body: 'x',
            createdAt: at(iso),
          },
        })
      })
    return { admin, luis, ana, marta, luisAccount, anaAccount, write }
  }
  const sees = async (ctx: Ctx, id: string) => (await listContacts(ctx)).some((c) => c.id === id)

  it('the reference delegate always sees the contact; others do not by default', async () => {
    const s = await scenario()
    expect(await sees(s.luis.ctx, s.marta.id)).toBe(true)
    expect(await sees(s.ana.ctx, s.marta.id)).toBe(false)
    expect(await sees(s.admin.ctx, s.marta.id)).toBe(true)
  })

  it('a delegate the contact just wrote to sees it, until the reference delegate exchanges a message', async () => {
    const s = await scenario()
    await s.write(s.anaAccount, 'chat-ana', 'INBOUND', '2026-03-02T09:00:00.000Z')
    expect(await sees(s.ana.ctx, s.marta.id)).toBe(true)
    // Luis writes to her afterwards (from anywhere): Ana stops seeing her.
    await s.write(s.luisAccount, 'chat-1', 'OUTBOUND', '2026-03-02T09:30:00.000Z')
    expect(await sees(s.ana.ctx, s.marta.id)).toBe(false)
    // She writes to Ana again, later still: Ana sees her again.
    await s.write(s.anaAccount, 'chat-ana', 'INBOUND', '2026-03-03T09:00:00.000Z')
    expect(await sees(s.ana.ctx, s.marta.id)).toBe(true)
    // ... and her reply to Luis closes it once more.
    await s.write(s.luisAccount, 'chat-1', 'INBOUND', '2026-03-03T10:00:00.000Z')
    expect(await sees(s.ana.ctx, s.marta.id)).toBe(false)
  })

  it('an outbound message from Ana alone never opens access (only the contact writing does)', async () => {
    const s = await scenario()
    await s.write(s.anaAccount, 'chat-ana', 'OUTBOUND', '2026-03-02T09:00:00.000Z')
    expect(await sees(s.ana.ctx, s.marta.id)).toBe(false)
  })

  it('tasks and other contact data follow the same rule', async () => {
    const s = await scenario()
    const { createTask, listTasks } = await import('../src/index.ts')
    const task = await createTask(s.admin.ctx, { title: 'Seguimiento', contactId: s.marta.id })
    expect((await listTasks(s.ana.ctx)).map((t) => t.id)).not.toContain(task.id)
    await s.write(s.anaAccount, 'chat-ana', 'INBOUND', '2026-03-02T09:00:00.000Z')
    expect((await listTasks(s.ana.ctx)).map((t) => t.id)).toContain(task.id)
  })
})
