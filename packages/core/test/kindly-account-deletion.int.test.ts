import { afterAll, describe, expect, it } from 'vitest'
import {
  assignContactToDelegate,
  connectMessagingAccount,
  createContact,
  createMessagingRegistry,
  disconnectMessagingAccount,
  FakeMessagingAdapter,
  kindlyDeletionRules,
  previewAccountDeletion,
  processAccountDeletions,
  requestAccountDeletion,
} from '../src/index.ts'
import { adminWithOrg, base, codeOf, db, joinMember } from './helpers.ts'

afterAll(async () => {
  await db.$disconnect()
})

const registry = createMessagingRegistry([new FakeMessagingAdapter('s3cret')])
const codes = async (userId: string) =>
  (await previewAccountDeletion(db, userId, kindlyDeletionRules)).blockers.map((b) => b.code)

describe('deleting the account of someone others depend on (Kindly rules)', () => {
  it('is blocked while they are the reference delegate of a contact, until it is reassigned', async () => {
    const admin = await adminWithOrg()
    const luis = await joinMember(admin, 'Luis')
    const contact = await createContact(luis.ctx, { name: 'Marta' })
    const userId = luis.ctx.actor.userId

    expect(await codes(userId)).toEqual(['REFERENCE_DELEGATE'])
    expect(await codeOf(requestAccountDeletion(base(), userId, kindlyDeletionRules))).toEqual({
      code: 'CONFLICT',
      detail: 'REFERENCE_DELEGATE',
    })

    await assignContactToDelegate(admin.ctx, contact.id, admin.ctx.actor.memberId)
    expect(await codes(userId)).toEqual([])
    const done = await requestAccountDeletion(base(), userId, kindlyDeletionRules)
    expect(done.scheduledFor).toBeInstanceOf(Date)
  })

  it('is blocked while they have a channel connected, until it is disconnected', async () => {
    const admin = await adminWithOrg()
    const luis = await joinMember(admin, 'Luis')
    const account = await connectMessagingAccount(luis.ctx, registry, { channel: 'fake' })
    const userId = luis.ctx.actor.userId
    expect(await codes(userId)).toEqual(['CHANNEL_CONNECTED'])
    await disconnectMessagingAccount(luis.ctx, registry, account.id)
    expect(await codes(userId)).toEqual([])
  })

  it('names the organization, and someone nobody depends on is not blocked', async () => {
    const admin = await adminWithOrg()
    const luis = await joinMember(admin, 'Luis')
    const ana = await joinMember(admin, 'Ana')
    await createContact(luis.ctx, { name: 'Marta' })
    const plan = await previewAccountDeletion(db, luis.ctx.actor.userId, kindlyDeletionRules)
    expect(plan.blockers).toEqual([
      {
        code: 'REFERENCE_DELEGATE',
        organizationId: admin.organization.id,
        organizationName: expect.any(String),
      },
    ])
    expect(await codes(ana.ctx.actor.userId)).toEqual([])
  })

  it('a rule that starts blocking during the grace period cancels the deletion instead of running it', async () => {
    const admin = await adminWithOrg()
    const luis = await joinMember(admin, 'Luis')
    const userId = luis.ctx.actor.userId
    await requestAccountDeletion(base(), userId, kindlyDeletionRules)
    // During the 14 days Luis keeps working and takes a new contact.
    await createContact(luis.ctx, { name: 'Nuevo afiliado' })

    const later = new Date(Date.now() + 15 * 86_400_000)
    await processAccountDeletions({ ...base(), now: () => later }, kindlyDeletionRules)
    const user = await db.user.findUniqueOrThrow({ where: { id: userId } })
    expect(user.anonymizedAt).toBeNull()
    expect(user.deletionScheduledFor).toBeNull()
    expect(user.authUserId).not.toBeNull()
  })
})
