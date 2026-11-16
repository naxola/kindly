import { withTenant, type Db, type TenantTx } from '@saas/database'
import { z } from 'zod'
import type { Ctx } from '../../context.ts'
import { escapeHtml, type EmailSender, type RenderedEmail } from '../../email.ts'
import { DomainError } from '../../errors.ts'
import { DEFAULT_LOCALE, isLocale, type Locale } from '../../i18n.ts'
import { defineJob, type JobContext } from '../../jobs.ts'
import { recordActivity } from '../activity/index.ts'
import { writeAudit } from '../audit/index.ts'
import { authorize } from '../identity/index.ts'
import { fullName } from '../team/index.ts'
import { assertContactVisible } from './service.ts'

/**
 * Welcome email to a contact that introduces its reference delegate (name, contact email and
 * phone), so the affiliate knows who to turn to. A template written by people and sent because a
 * person asked for it: no AI involved (CLAUDE.md, "La AI es copiloto").
 *
 * It is stamped per assignment (`contact_assignments.welcome_sent_at`) after a successful send: a
 * new delegate means a new introduction, and a failed send can be retried. If the contact changes
 * delegate before the job runs, the email is not sent: it would introduce the wrong person.
 */
export const contactWelcomeEmailJob = defineJob({
  name: 'contacts.welcome-email',
  schema: z.object({
    assignmentId: z.uuid(),
    /** Who asked for it; null when it is the automatic one of a creation or reassignment. */
    requestedByMemberId: z.uuid().nullable(),
  }),
  retryLimit: 5,
  retryDelaySeconds: 60,
})

/**
 * Enqueues the welcome of an assignment inside the caller's transaction. `effect` distinguishes an
 * explicit resend (a new email each time) from the one that goes with a creation or reassignment
 * (at most one per assignment).
 */
export async function enqueueContactWelcome(
  ctx: Ctx,
  tx: TenantTx,
  assignmentId: string,
  effect: 'assignment' | 'resend',
): Promise<void> {
  await ctx.queue.enqueue(
    tx,
    contactWelcomeEmailJob,
    { assignmentId, requestedByMemberId: ctx.actor.memberId },
    {
      organizationId: ctx.actor.organizationId,
      correlationId: ctx.correlationId,
      idempotencyKey:
        effect === 'assignment'
          ? `contact-welcome:${assignmentId}`
          : `contact-welcome:${assignmentId}:${ctx.correlationId}`,
    },
  )
}

/**
 * Sends (again) the welcome of a visible contact to its current delegate. Needs the contact's
 * email and a reference delegate.
 */
export async function sendContactWelcome(ctx: Ctx, contactId: string): Promise<{ queued: true }> {
  authorize(ctx.actor, 'contacts.write')
  return withTenant(ctx.db, ctx.actor.organizationId, async (tx) => {
    const contact = await assertContactVisible(tx, ctx.actor, contactId)
    if (!contact.email) {
      throw new DomainError('VALIDATION_FAILED', 'The contact has no email', [
        { path: 'email', code: 'WELCOME_NO_EMAIL' },
      ])
    }
    const current = await tx.contactAssignment.findFirst({
      where: { contactId, endedAt: null },
      select: { id: true },
    })
    if (!current) {
      throw new DomainError('CONFLICT', 'The contact has no reference delegate', [
        { code: 'WELCOME_NO_DELEGATE' },
      ])
    }
    await enqueueContactWelcome(ctx, tx, current.id, 'resend')
    await writeAudit(tx, {
      organizationId: ctx.actor.organizationId,
      actorUserId: ctx.actor.userId,
      action: 'contact.welcome_requested',
      resourceType: 'contact',
      resourceId: contactId,
      correlationId: ctx.correlationId,
      ip: ctx.ip,
    })
    return { queued: true as const }
  })
}

export interface WelcomeEmailInput {
  locale: Locale
  contactName: string
  organizationName: string
  delegate: { name: string; email: string | null; phone: string | null }
}

const COPY = {
  es: {
    subject: (org: string) => `Bienvenida a ${org}`,
    heading: 'Te damos la bienvenida',
    greeting: (name: string) => `Hola, ${name}:`,
    intro: (org: string, delegate: string) =>
      `Te damos la bienvenida a ${org}. A partir de ahora, ${delegate} será tu persona de referencia y te acompañará en cualquier gestión o duda que tengas.`,
    reach: 'Puedes escribirle o llamarle cuando lo necesites:',
    name: 'Nombre',
    email: 'Email',
    phone: 'Teléfono',
    close: 'Estamos a tu disposición. Un cordial saludo.',
    footer: (org: string) =>
      `Recibes este correo porque ${org} te ha dado de alta. Si crees que es un error, responde a este mensaje.`,
  },
  en: {
    subject: (org: string) => `Welcome to ${org}`,
    heading: 'Welcome',
    greeting: (name: string) => `Hello ${name},`,
    intro: (org: string, delegate: string) =>
      `Welcome to ${org}. From now on, ${delegate} will be your point of contact and will help you with any procedure or question you have.`,
    reach: 'You can write or call them whenever you need to:',
    name: 'Name',
    email: 'Email',
    phone: 'Phone',
    close: 'We are at your disposal. Kind regards.',
    footer: (org: string) =>
      `You receive this email because ${org} has registered you. If you think it is a mistake, reply to this message.`,
  },
} as const

/** Pure: subject, plain text and escaped HTML of the welcome email. */
export function welcomeEmail(input: WelcomeEmailInput): RenderedEmail {
  const t = COPY[input.locale]
  const { delegate } = input
  const rows: { label: string; value: string; href?: string }[] = [
    { label: t.name, value: delegate.name },
    ...(delegate.email
      ? [{ label: t.email, value: delegate.email, href: `mailto:${delegate.email}` }]
      : []),
    ...(delegate.phone
      ? [{ label: t.phone, value: delegate.phone, href: `tel:${delegate.phone}` }]
      : []),
  ]
  const greeting = t.greeting(input.contactName)
  const intro = t.intro(input.organizationName, delegate.name)
  const text = [
    greeting,
    '',
    intro,
    '',
    t.reach,
    ...rows.map((r) => `  ${r.label}: ${r.value}`),
    '',
    t.close,
    input.organizationName,
    '',
    t.footer(input.organizationName),
    '',
  ].join('\n')
  const cell = (r: (typeof rows)[number]) =>
    r.href ? `<a href="${escapeHtml(r.href)}">${escapeHtml(r.value)}</a>` : escapeHtml(r.value)
  const html = [
    `<h1 style="font-size:20px">${escapeHtml(t.heading)}</h1>`,
    `<p>${escapeHtml(greeting)}</p>`,
    `<p>${escapeHtml(intro)}</p>`,
    `<p>${escapeHtml(t.reach)}</p>`,
    `<table role="presentation" cellpadding="4">${rows
      .map((r) => `<tr><td><strong>${escapeHtml(r.label)}</strong></td><td>${cell(r)}</td></tr>`)
      .join('')}</table>`,
    `<p>${escapeHtml(t.close)}<br>${escapeHtml(input.organizationName)}</p>`,
    `<p style="color:#666;font-size:12px">${escapeHtml(t.footer(input.organizationName))}</p>`,
  ].join('')
  return { subject: t.subject(input.organizationName), text, html }
}

/**
 * Worker side: reads everything in the tenant context, sends, then stamps the assignment and
 * records the activity. Skips (without failing) when there is nothing correct to send.
 */
export const contactWelcomeHandler =
  (deps: { db: Db; email: EmailSender }) =>
  async (
    payload: z.output<typeof contactWelcomeEmailJob.schema>,
    job: JobContext,
  ): Promise<void> => {
    const organizationId = job.organizationId
    if (!organizationId) throw new Error('contacts.welcome-email needs an organization')
    const data = await withTenant(deps.db, organizationId, async (tx) => {
      const assignment = await tx.contactAssignment.findUnique({
        where: { id: payload.assignmentId },
        include: { contact: true, organization: true },
      })
      // Reassigned meanwhile, or gone: introducing this delegate now would be wrong.
      if (!assignment || assignment.endedAt) return null
      if (!assignment.contact.email) return null
      const member = await tx.organizationMember.findUnique({
        where: { id: assignment.delegateId },
        select: { status: true, user: { select: { displayName: true } }, profile: true },
      })
      if (!member || member.status !== 'ACTIVE') return null
      return { assignment, member }
    })
    if (!data) return
    const { assignment, member } = data
    const org = assignment.organization
    const delegate = {
      name: member.profile ? fullName(member.profile) : member.user.displayName,
      email: member.profile?.contactEmail ?? null,
      phone: member.profile?.phone ?? null,
    }
    await deps.email.send({
      to: assignment.contact.email!,
      idempotencyKey: `${contactWelcomeEmailJob.name}:${job.jobId}`,
      ...(delegate.email ? { replyTo: delegate.email } : {}),
      ...welcomeEmail({
        locale: isLocale(org.defaultLocale) ? org.defaultLocale : DEFAULT_LOCALE,
        contactName: assignment.contact.name,
        organizationName: org.name,
        delegate,
      }),
    })
    await withTenant(deps.db, organizationId, async (tx) => {
      await tx.contactAssignment.update({
        where: { id: assignment.id },
        data: { welcomeSentAt: new Date() },
      })
      await recordActivity(tx, {
        organizationId,
        type: 'CONTACT_WELCOME_SENT',
        actorMemberId: payload.requestedByMemberId,
        entityType: 'contact',
        entityId: assignment.contactId,
        metadata: { delegateId: assignment.delegateId },
      })
    })
  }
