import { newId, withTenant } from '@saas/database'
import pg from 'pg'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import {
  connectMessagingAccount,
  createMessagingRegistry,
  FakeMessagingAdapter,
  processWebhookEvent,
  purgeExpiredWebhookEvents,
  receiveWebhook,
} from '../src/index.ts'
import { adminWithOrg, db, queue, type Org } from './helpers.ts'

/** Retention of raw webhook events: 30 days processed, 90 days failed or unprocessed. */
const fake = new FakeMessagingAdapter('s3cret')
const registry = createMessagingRegistry([fake])
const DAY = 86_400_000

let platform: pg.Client
beforeAll(async () => {
  // Reads what RLS hides from app_user (events of any age, of any organization).
  platform = new pg.Client({
    connectionString: process.env.TEST_DATABASE_URL!.replace(
      /\/\/[^@]+@/,
      `//app_platform:${process.env.APP_PLATFORM_PASSWORD ?? 'platform'}@`,
    ),
  })
  await platform.connect()
})
afterAll(async () => {
  await platform.end()
  await db.$disconnect()
})

/** A stored event of `org`, `ageDays` old, in the given state. Processed ones create a message. */
async function event(
  org: Org,
  accountId: string,
  ageDays: number,
  state: 'processed' | 'failed' | 'pending',
) {
  const body = {
    kind: 'MESSAGE',
    externalConversationId: 'chat-1',
    externalMessageId: `m-${newId()}`,
    externalContactId: 'ext-marta',
    contactDisplayName: 'Marta Gil',
    contactPhone: '+34600111222',
    text: `Hola ${state} ${ageDays}`,
  }
  const outcome = await receiveWebhook(
    { db, queue, registry, correlationId: newId() },
    'fake',
    accountId,
    JSON.stringify(body),
    fake.signatureHeaders(),
  )
  if (outcome.status !== 200) throw new Error(`webhook answered ${outcome.status}`)
  const id = outcome.webhookEventId
  if (state === 'processed') await processWebhookEvent({ db, registry }, org.organization.id, id)
  await withTenant(db, org.organization.id, (tx) =>
    tx.webhookEvent.update({
      where: { id },
      data: {
        receivedAt: new Date(Date.now() - ageDays * DAY),
        ...(state === 'failed' ? { processingError: 'boom' } : {}),
      },
    }),
  )
  return { id, externalMessageId: body.externalMessageId }
}

const exists = async (id: string) =>
  (await platform.query('SELECT 1 FROM webhook_events WHERE id = $1', [id])).rowCount === 1

describe('retention of webhook events', () => {
  it('purges processed events after 30 days and failed or pending ones after 90, keeping the messages', async () => {
    const admin = await adminWithOrg()
    const accountId = (await connectMessagingAccount(admin.ctx, registry, { channel: 'fake' })).id

    const processedOld = await event(admin, accountId, 31, 'processed')
    const processedRecent = await event(admin, accountId, 29, 'processed')
    const failedMid = await event(admin, accountId, 60, 'failed')
    const pendingMid = await event(admin, accountId, 60, 'pending')
    const failedOld = await event(admin, accountId, 91, 'failed')
    const pendingOld = await event(admin, accountId, 91, 'pending')

    const message = (externalMessageId: string) =>
      withTenant(db, admin.organization.id, (tx) =>
        tx.message.findFirstOrThrow({ where: { externalMessageId } }),
      )
    expect((await message(processedOld.externalMessageId)).sourceWebhookEventId).toBe(
      processedOld.id,
    )

    const deleted = await purgeExpiredWebhookEvents(db)
    expect(deleted).toBeGreaterThanOrEqual(3)

    expect(await exists(processedOld.id)).toBe(false)
    expect(await exists(failedOld.id)).toBe(false)
    expect(await exists(pendingOld.id)).toBe(false)
    expect(await exists(processedRecent.id)).toBe(true)
    expect(await exists(failedMid.id)).toBe(true)
    expect(await exists(pendingMid.id)).toBe(true)

    // The message survives with its text; only the link to the raw event is gone.
    const kept = await message(processedOld.externalMessageId)
    expect(kept.body).toContain('Hola processed 31')
    expect(kept.sourceWebhookEventId).toBeNull()
    // A message whose event stays keeps its link.
    expect((await message(processedRecent.externalMessageId)).sourceWebhookEventId).toBe(
      processedRecent.id,
    )
  })

  it('purges the expired events of every organization and leaves each one its recent ones', async () => {
    const a = await adminWithOrg()
    const b = await adminWithOrg()
    const accA = (await connectMessagingAccount(a.ctx, registry, { channel: 'fake' })).id
    const accB = (await connectMessagingAccount(b.ctx, registry, { channel: 'fake' })).id
    const oldA = await event(a, accA, 40, 'processed')
    const oldB = await event(b, accB, 40, 'processed')
    const freshA = await event(a, accA, 1, 'processed')
    const freshB = await event(b, accB, 1, 'processed')
    await purgeExpiredWebhookEvents(db)
    expect(await exists(oldA.id)).toBe(false)
    expect(await exists(oldB.id)).toBe(false)
    expect(await exists(freshA.id)).toBe(true)
    expect(await exists(freshB.id)).toBe(true)
  })

  it('audits the purge without an organization, and a second run has nothing to do', async () => {
    const admin = await adminWithOrg()
    const accountId = (await connectMessagingAccount(admin.ctx, registry, { channel: 'fake' })).id
    await event(admin, accountId, 45, 'processed')
    const deleted = await purgeExpiredWebhookEvents(db)
    expect(deleted).toBeGreaterThanOrEqual(1)
    const audit = await platform.query(
      `SELECT after FROM audit_logs WHERE action = 'webhook_events.purged' ORDER BY created_at DESC LIMIT 1`,
    )
    expect(audit.rows[0].after.deleted).toBe(deleted)
    expect(await purgeExpiredWebhookEvents(db)).toBe(0)
  })

  it('the function cannot be told what to delete: it takes no argument and leaves recent events alone', async () => {
    const admin = await adminWithOrg()
    const accountId = (await connectMessagingAccount(admin.ctx, registry, { channel: 'fake' })).id
    const recent = await event(admin, accountId, 5, 'processed')
    await expect(
      db.$queryRawUnsafe(`SELECT app.purge_expired_webhook_events('${recent.id}'::uuid)`),
    ).rejects.toThrow(/function app\.purge_expired_webhook_events\(uuid\) does not exist/)
    await purgeExpiredWebhookEvents(db)
    expect(await exists(recent.id)).toBe(true)
  })
})
