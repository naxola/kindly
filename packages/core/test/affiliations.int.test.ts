import { withTenant } from '@saas/database'
import { afterAll, describe, expect, it } from 'vitest'
import {
  assignContactToDelegate,
  createAffiliation,
  createContact,
  endAffiliation,
  getCurrentAffiliation,
  listAffiliationHistory,
  listContactActivity,
  updateAffiliation,
} from '../src/index.ts'
import { adminWithOrg, codeOf, db, joinMember } from './helpers.ts'

afterAll(async () => {
  await db.$disconnect()
})

async function orgWithContact() {
  const admin = await adminWithOrg()
  const contact = await createContact(admin.ctx, { name: 'Marta' })
  return { admin, contact }
}

describe('alta', () => {
  it('a fresh contact has no affiliation until alta', async () => {
    const { admin, contact } = await orgWithContact()
    expect(await getCurrentAffiliation(admin.ctx, contact.id)).toBeNull()
    expect(await listAffiliationHistory(admin.ctx, contact.id)).toEqual([])
  })

  it('creates an ACTIVE period, stores the fee as its first day and shows it on the timeline', async () => {
    const { admin, contact } = await orgWithContact()
    const a = await createAffiliation(admin.ctx, contact.id, {
      memberNumber: ' 0042 ',
      startedAt: '2026-01-15',
      feePaidUntil: '2026-09',
    })
    expect(a).toMatchObject({ status: 'ACTIVE', memberNumber: '0042', endedAt: null })
    expect(a.feePaidUntil?.toISOString().slice(0, 10)).toBe('2026-09-01')
    expect(a.startedAt.toISOString().slice(0, 10)).toBe('2026-01-15')
    const types = (await listContactActivity(admin.ctx, contact.id)).map((x) => x.type)
    expect(types).toContain('AFFILIATION_CREATED')
  })

  it('refuses a second alta while one is active', async () => {
    const { admin, contact } = await orgWithContact()
    await createAffiliation(admin.ctx, contact.id, {})
    expect(await codeOf(createAffiliation(admin.ctx, contact.id, {}))).toEqual({
      code: 'CONFLICT',
      detail: 'ALREADY_AFFILIATED',
    })
  })

  it('the database ties ACTIVE to having no end date, and allows one open period', async () => {
    const { admin, contact } = await orgWithContact()
    await createAffiliation(admin.ctx, contact.id, {})
    const insert = (status: 'ACTIVE' | 'INACTIVE', endedAt: Date | null) =>
      withTenant(db, admin.organization.id, (tx) =>
        tx.affiliation.create({
          data: { organizationId: admin.organization.id, contactId: contact.id, status, endedAt },
        }),
      )
    await expect(insert('ACTIVE', new Date())).rejects.toThrow(
      /affiliations_status_matches_end_check/,
    )
    await expect(insert('ACTIVE', null)).rejects.toMatchObject({ code: 'P2002' })
  })
})

describe('update and baja', () => {
  it('edits the open period in place, without starting a new one', async () => {
    const { admin, contact } = await orgWithContact()
    const first = await createAffiliation(admin.ctx, contact.id, { memberNumber: '1' })
    const updated = await updateAffiliation(admin.ctx, contact.id, {
      memberNumber: '2',
      feePaidUntil: '2026-10',
    })
    expect(updated.id).toBe(first.id)
    expect(updated.memberNumber).toBe('2')
    expect(await listAffiliationHistory(admin.ctx, contact.id)).toHaveLength(1)
  })

  it('has nothing to edit or end without an open period', async () => {
    const { admin, contact } = await orgWithContact()
    const none = { code: 'CONFLICT', detail: 'NO_ACTIVE_AFFILIATION' }
    expect(await codeOf(updateAffiliation(admin.ctx, contact.id, {}))).toEqual(none)
    expect(await codeOf(endAffiliation(admin.ctx, contact.id))).toEqual(none)
  })

  it('baja closes the period and keeps it as history; rejoining keeps both', async () => {
    const { admin, contact } = await orgWithContact()
    await createAffiliation(admin.ctx, contact.id, { startedAt: '2025-01-01' })
    const ended = await endAffiliation(admin.ctx, contact.id)
    expect(ended).toMatchObject({ status: 'INACTIVE' })
    expect(ended.endedAt).not.toBeNull()
    expect((await getCurrentAffiliation(admin.ctx, contact.id))?.status).toBe('INACTIVE')

    const again = await createAffiliation(admin.ctx, contact.id, { startedAt: '2026-03-01' })
    const history = await listAffiliationHistory(admin.ctx, contact.id)
    expect(history.map((h) => h.status)).toEqual(['ACTIVE', 'INACTIVE'])
    expect((await getCurrentAffiliation(admin.ctx, contact.id))?.id).toBe(again.id)
  })

  it('prefers the open row over a closed one that starts the same day', async () => {
    const { admin, contact } = await orgWithContact()
    await createAffiliation(admin.ctx, contact.id, { startedAt: '2026-05-05' })
    await endAffiliation(admin.ctx, contact.id)
    const rejoin = await createAffiliation(admin.ctx, contact.id, { startedAt: '2026-05-05' })
    expect((await getCurrentAffiliation(admin.ctx, contact.id))?.id).toBe(rejoin.id)
    expect((await listAffiliationHistory(admin.ctx, contact.id))[0]?.id).toBe(rejoin.id)
  })
})

describe('fee overdue', () => {
  it('is computed on the server from the fee month and the current date', async () => {
    const { admin, contact } = await orgWithContact()
    await createAffiliation(admin.ctx, contact.id, { feePaidUntil: '2026-01' })
    const at = (iso: string) => ({ ...admin.ctx, now: () => new Date(iso) })
    expect((await getCurrentAffiliation(at('2026-01-20T10:00:00Z'), contact.id))?.feeOverdue).toBe(
      false,
    )
    expect((await getCurrentAffiliation(at('2026-02-01T00:00:00Z'), contact.id))?.feeOverdue).toBe(
      true,
    )
  })
})

describe('who can touch it', () => {
  it('a delegate edits the affiliation of their own contacts, not of the others', async () => {
    const admin = await adminWithOrg()
    const luis = await joinMember(admin, 'Luis')
    const own = await createContact(luis.ctx, { name: 'Suyo' })
    const other = await createContact(admin.ctx, { name: 'Del admin' })
    expect((await createAffiliation(luis.ctx, own.id, {})).status).toBe('ACTIVE')
    expect(await codeOf(createAffiliation(luis.ctx, other.id, {}))).toMatchObject({
      code: 'NOT_FOUND',
    })
    expect(await codeOf(getCurrentAffiliation(luis.ctx, other.id))).toMatchObject({
      code: 'NOT_FOUND',
    })
    // After a reassignment the former delegate can no longer edit it.
    await assignContactToDelegate(admin.ctx, own.id, admin.ctx.actor.memberId)
    expect(await codeOf(endAffiliation(luis.ctx, own.id))).toMatchObject({ code: 'NOT_FOUND' })
  })
})

describe('tenant isolation', () => {
  it('an affiliation never crosses organizations', async () => {
    const a = await orgWithContact()
    const b = await adminWithOrg()
    await createAffiliation(a.admin.ctx, a.contact.id, {})
    expect(await codeOf(getCurrentAffiliation(b.ctx, a.contact.id))).toMatchObject({
      code: 'NOT_FOUND',
    })
    expect(await codeOf(createAffiliation(b.ctx, a.contact.id, {}))).toMatchObject({
      code: 'NOT_FOUND',
    })
  })
})
