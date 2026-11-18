import { createDb, newId, type Db } from '@saas/database'
import { RecordingQueue } from './fake-queue.ts'
import {
  acceptInvitationWithProfile,
  createOrganizationWithTeam,
  DomainError,
  ensureUser,
  inviteMember,
  resolveActor,
  type Ctx,
} from '../src/index.ts'

/** Shared fixtures of the integration tests of the CRM modules. Tests may touch auth_*. */
export const db: Db = createDb({ connectionString: process.env.DATABASE_URL! })
export const queue = new RecordingQueue()
export const base = () => ({ db, queue, correlationId: newId(), appUrl: 'https://app.example.com' })

export async function accessAccount(email = `p-${newId()}@example.com`, name = 'Person') {
  return db.authUser.create({ data: { id: newId(), email, name, emailVerified: true } })
}

export interface Org {
  organization: { id: string }
  ctx: Ctx
}

/** An organization with its creator (ADMIN). */
export async function adminWithOrg(name = 'Ana López'): Promise<Org> {
  const access = await accessAccount(undefined, name)
  const user = await ensureUser(base(), access.id)
  const { organization } = await createOrganizationWithTeam(base(), user.id, {
    name: 'Acme',
    slug: `org-${newId().slice(-12)}`,
    defaultLocale: 'es',
  })
  const { actor } = await resolveActor(db, { userId: user.id, organizationId: organization.id })
  return { organization, ctx: { ...base(), actor } }
}

/** A plain MEMBER (a "delegate") invited by the admin of `org`. */
export async function joinMember(org: Org, firstName = 'Luis') {
  const email = `m-${newId()}@example.com`
  const { token } = await inviteMember(org.ctx, { email, role: 'MEMBER', firstName })
  const access = await accessAccount(email, `Cuenta ${firstName}`)
  const user = await ensureUser(base(), access.id)
  const member = await acceptInvitationWithProfile(base(), { token, userId: user.id })
  const { actor } = await resolveActor(db, { userId: user.id, organizationId: org.organization.id })
  return { member, ctx: { ...base(), actor } as Ctx }
}

export const codeOf = async (p: Promise<unknown>) => {
  try {
    await p
  } catch (e) {
    if (e instanceof DomainError) return { code: e.code, detail: e.details?.[0]?.code }
    throw e
  }
  throw new Error('expected a DomainError')
}
