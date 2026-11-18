import { newId, withTenant } from '@saas/database'
import { afterAll, describe, expect, it } from 'vitest'
import {
  assignContactToDelegate,
  contactWelcomeHandler,
  createContact,
  getContact,
  listContactActivity,
  sendContactWelcome,
  updateMyProfile,
  type EmailMessage,
  type EmailSender,
} from '../src/index.ts'
import { adminWithOrg, codeOf, db, joinMember, queue, type Org } from './helpers.ts'

afterAll(async () => {
  await db.$disconnect()
})

class RecordingSender implements EmailSender {
  readonly sent: EmailMessage[] = []
  send(message: EmailMessage) {
    this.sent.push(message)
    return Promise.resolve({ providerMessageId: `p-${this.sent.length}` })
  }
}

const JOB = 'contacts.welcome-email'
const lastJob = () => queue.of(JOB).at(-1)!

/** Runs the queued welcome as the worker would. */
async function runLast(org: Org, sender = new RecordingSender()) {
  const job = lastJob()
  await contactWelcomeHandler({ db, email: sender })(
    job.payload as { assignmentId: string; requestedByMemberId: string | null },
    {
      jobId: newId(),
      attempt: 0,
      organizationId: org.organization.id,
      correlationId: job.options.correlationId,
    },
  )
  return sender
}

const openAssignment = (org: Org, contactId: string) =>
  withTenant(db, org.organization.id, (tx) =>
    tx.contactAssignment.findFirstOrThrow({ where: { contactId, endedAt: null } }),
  )

describe('welcome email when creating a contact', () => {
  it('an administrator chooses the delegate and the welcome introduces them', async () => {
    const admin = await adminWithOrg()
    const luis = await joinMember(admin, 'Luis')
    await updateMyProfile(luis.ctx, {
      firstName: 'Luis',
      lastName: 'Pérez',
      phone: '+34600111222',
      contactEmail: 'luis@norte.test',
    })
    const before = queue.of(JOB).length
    const contact = await createContact(admin.ctx, {
      name: 'Marta Gil',
      email: 'marta@example.test',
      delegateId: luis.ctx.actor.memberId,
      sendWelcome: true,
    })
    expect(contact.referenceDelegate?.memberId).toBe(luis.ctx.actor.memberId)
    expect(contact.referenceDelegate?.welcomeSentAt).toBeNull()
    expect(queue.of(JOB)).toHaveLength(before + 1)
    const assignment = await openAssignment(admin, contact.id)
    expect(lastJob().options.idempotencyKey).toBe(`contact-welcome:${assignment.id}`)
    expect(lastJob().options.organizationId).toBe(admin.organization.id)

    const sender = await runLast(admin)
    expect(sender.sent).toHaveLength(1)
    const [email] = sender.sent
    expect(email!.to).toBe('marta@example.test')
    expect(email!.replyTo).toBe('luis@norte.test')
    expect(email!.text).toContain('Luis Pérez será tu persona de referencia')
    expect(email!.text).toContain('+34600111222')

    const after = await getContact(admin.ctx, contact.id)
    expect(after.referenceDelegate?.welcomeSentAt).toBeInstanceOf(Date)
    const timeline = await listContactActivity(admin.ctx, contact.id)
    expect(timeline.map((a) => a.type)).toContain('CONTACT_WELCOME_SENT')
  })

  it('without the checkbox nothing is sent, and the welcome needs an email', async () => {
    const admin = await adminWithOrg()
    const before = queue.of(JOB).length
    await createContact(admin.ctx, { name: 'Sin aviso', email: 'x@example.test' })
    expect(queue.of(JOB)).toHaveLength(before)
    expect(
      await codeOf(createContact(admin.ctx, { name: 'Sin email', sendWelcome: true })),
    ).toEqual({ code: 'VALIDATION_FAILED', detail: 'WELCOME_NO_EMAIL' })
  })

  it('a delegate cannot make someone else the delegate of a new contact', async () => {
    const admin = await adminWithOrg()
    const luis = await joinMember(admin, 'Luis')
    expect(
      await codeOf(
        createContact(luis.ctx, { name: 'Ajeno', delegateId: admin.ctx.actor.memberId }),
      ),
    ).toMatchObject({ code: 'FORBIDDEN' })
    // Choosing themselves is the default and is allowed.
    const own = await createContact(luis.ctx, {
      name: 'Propio',
      delegateId: luis.ctx.actor.memberId,
    })
    expect(own.referenceDelegate?.memberId).toBe(luis.ctx.actor.memberId)
  })

  it('an inactive or foreign member cannot be chosen', async () => {
    const admin = await adminWithOrg()
    const other = await adminWithOrg('Otra')
    expect(
      await codeOf(createContact(admin.ctx, { name: 'X', delegateId: other.ctx.actor.memberId })),
    ).toEqual({ code: 'VALIDATION_FAILED', detail: 'INVALID_DELEGATE' })
  })
})

describe('welcome email when reassigning and on demand', () => {
  it('reassigning with notice introduces the new delegate; without it, nothing is sent', async () => {
    const admin = await adminWithOrg()
    const luis = await joinMember(admin, 'Luis')
    const ana = await joinMember(admin, 'Ana')
    const contact = await createContact(admin.ctx, { name: 'Marta', email: 'm@example.test' })
    const before = queue.of(JOB).length
    await assignContactToDelegate(admin.ctx, contact.id, luis.ctx.actor.memberId)
    expect(queue.of(JOB)).toHaveLength(before)
    await assignContactToDelegate(admin.ctx, contact.id, ana.ctx.actor.memberId, {
      notifyContact: true,
    })
    expect(queue.of(JOB)).toHaveLength(before + 1)
    const sender = await runLast(admin)
    expect(sender.sent[0]!.text).toContain('Ana será tu persona de referencia')
  })

  it('does not introduce a delegate who stopped being the reference before the job ran', async () => {
    const admin = await adminWithOrg()
    const luis = await joinMember(admin, 'Luis')
    const contact = await createContact(admin.ctx, {
      name: 'Marta',
      email: 'm@example.test',
      sendWelcome: true,
    })
    const queued = lastJob()
    await assignContactToDelegate(admin.ctx, contact.id, luis.ctx.actor.memberId)
    const sender = new RecordingSender()
    await contactWelcomeHandler({ db, email: sender })(
      queued.payload as { assignmentId: string; requestedByMemberId: string | null },
      { jobId: newId(), attempt: 0, organizationId: admin.organization.id, correlationId: 'c' },
    )
    expect(sender.sent).toHaveLength(0)
  })

  it('can be sent again on demand, each time as a new email', async () => {
    const admin = await adminWithOrg()
    const contact = await createContact(admin.ctx, { name: 'Marta', email: 'm@example.test' })
    await sendContactWelcome(admin.ctx, contact.id)
    const first = lastJob().options.idempotencyKey
    await sendContactWelcome({ ...admin.ctx, correlationId: newId() }, contact.id)
    expect(lastJob().options.idempotencyKey).not.toBe(first)
    await runLast(admin)
    expect(
      (await getContact(admin.ctx, contact.id)).referenceDelegate?.welcomeSentAt,
    ).toBeInstanceOf(Date)
  })

  it('needs the email, and a contact the person cannot see does not exist for them', async () => {
    const admin = await adminWithOrg()
    const luis = await joinMember(admin, 'Luis')
    const noEmail = await createContact(admin.ctx, { name: 'Sin email' })
    expect(await codeOf(sendContactWelcome(admin.ctx, noEmail.id))).toEqual({
      code: 'VALIDATION_FAILED',
      detail: 'WELCOME_NO_EMAIL',
    })
    const hidden = await createContact(admin.ctx, { name: 'Ajeno', email: 'a@example.test' })
    expect(await codeOf(sendContactWelcome(luis.ctx, hidden.id))).toMatchObject({
      code: 'NOT_FOUND',
    })
    const other = await adminWithOrg('Otra')
    expect(await codeOf(sendContactWelcome(other.ctx, hidden.id))).toMatchObject({
      code: 'NOT_FOUND',
    })
  })
})
