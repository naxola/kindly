import { newId, withTenant } from '@saas/database'
import { afterAll, describe, expect, it } from 'vitest'
import { ZodError } from 'zod'
import {
  assignContactToDelegate,
  createContact,
  getContact,
  listAssignmentHistory,
  listContactActivity,
  listContacts,
  markContactIdentified,
  updateContact,
} from '../src/index.ts'
import { adminWithOrg, codeOf, db, joinMember } from './helpers.ts'

afterAll(async () => {
  await db.$disconnect()
})

describe('creating and editing contacts', () => {
  it('assigns the creator as reference delegate and leaves a timeline entry and an audit', async () => {
    const admin = await adminWithOrg('Ana López')
    const contact = await createContact(admin.ctx, {
      name: ' Marta Gil ',
      phone: '+34 600 111 222',
      email: 'MARTA@Example.com',
      notes: '',
    })
    expect(contact).toMatchObject({
      name: 'Marta Gil',
      phone: '+34600111222',
      email: 'marta@example.com',
      notes: null,
      isUnassigned: false,
      referenceDelegate: { memberId: admin.ctx.actor.memberId, name: 'Ana López' },
    })
    const timeline = await listContactActivity(admin.ctx, contact.id)
    expect(timeline.map((a) => a.type)).toEqual(['CONTACT_CREATED'])
    expect(timeline[0]?.actorName).toBe('Ana López')
    const audit = await withTenant(db, admin.organization.id, (tx) =>
      tx.auditLog.findMany({ where: { resourceType: 'contact' } }),
    )
    expect(audit.map((a) => a.action)).toEqual(['contact.created'])
    expect(JSON.stringify(audit)).not.toContain('Marta')
  })

  it('only the name is required, and a malformed phone is rejected', async () => {
    const admin = await adminWithOrg()
    const bare = await createContact(admin.ctx, { name: 'Solo nombre' })
    expect(bare).toMatchObject({ phone: null, email: null, notes: null })
    await expect(createContact(admin.ctx, { name: '' })).rejects.toBeInstanceOf(ZodError)
    await expect(
      createContact(admin.ctx, { name: 'X', phone: '600111222' }),
    ).rejects.toBeInstanceOf(ZodError)
  })

  it('replaces the editable fields and records CONTACT_UPDATED', async () => {
    const admin = await adminWithOrg()
    const c = await createContact(admin.ctx, { name: 'Marta', phone: '+34600111222' })
    const updated = await updateContact(admin.ctx, c.id, {
      name: 'Marta Gil',
      email: 'm@example.com',
    })
    expect(updated).toMatchObject({ name: 'Marta Gil', phone: null, email: 'm@example.com' })
    const types = (await listContactActivity(admin.ctx, c.id)).map((a) => a.type)
    expect(types).toEqual(['CONTACT_UPDATED', 'CONTACT_CREATED'])
  })

  it('clears the unassigned flag of an auto-created contact', async () => {
    const admin = await adminWithOrg()
    const c = await createContact(admin.ctx, { name: 'Desconocido' })
    await withTenant(db, admin.organization.id, (tx) =>
      tx.contact.update({ where: { id: c.id }, data: { isUnassigned: true } }),
    )
    expect((await getContact(admin.ctx, c.id)).isUnassigned).toBe(true)
    expect((await markContactIdentified(admin.ctx, c.id)).isUnassigned).toBe(false)
    const types = (await listContactActivity(admin.ctx, c.id)).map((a) => a.type)
    expect(types).toContain('CONTACT_IDENTIFIED')
    // Confirming again changes and records nothing.
    expect((await markContactIdentified(admin.ctx, c.id)).isUnassigned).toBe(false)
    const again = (await listContactActivity(admin.ctx, c.id)).map((a) => a.type)
    expect(again.filter((t) => t === 'CONTACT_IDENTIFIED')).toHaveLength(1)
  })
})

describe('reassigning the reference delegate', () => {
  it('closes the previous assignment, opens a new one and records who and from whom', async () => {
    const admin = await adminWithOrg('Ana López')
    const luis = await joinMember(admin, 'Luis')
    const c = await createContact(admin.ctx, { name: 'Marta' })
    const first = await assignContactToDelegate(admin.ctx, c.id, luis.ctx.actor.memberId)
    expect(first.delegateName).toBe('Luis')
    const history = await listAssignmentHistory(admin.ctx, c.id)
    expect(history.map((h) => [h.delegateName, h.endedAt === null])).toEqual([
      ['Luis', true],
      ['Ana López', false],
    ])
    expect(history[0]?.assignedById).toBe(admin.ctx.actor.memberId)
    const assigned = (await listContactActivity(admin.ctx, c.id)).find(
      (a) => a.type === 'CONTACT_DELEGATE_ASSIGNED',
    )
    expect(assigned?.metadata).toEqual({
      from: admin.ctx.actor.memberId,
      to: luis.ctx.actor.memberId,
    })
    expect((await getContact(admin.ctx, c.id)).referenceDelegate?.name).toBe('Luis')
  })

  it('does nothing when reassigning to the delegate it already has', async () => {
    const admin = await adminWithOrg()
    const c = await createContact(admin.ctx, { name: 'Marta' })
    await assignContactToDelegate(admin.ctx, c.id, admin.ctx.actor.memberId)
    expect(await listAssignmentHistory(admin.ctx, c.id)).toHaveLength(1)
    const types = (await listContactActivity(admin.ctx, c.id)).map((a) => a.type)
    expect(types).toEqual(['CONTACT_CREATED'])
  })

  it('refuses a delegate outside the organization or disabled, and anyone who is not an admin', async () => {
    const a = await adminWithOrg()
    const b = await adminWithOrg()
    const luis = await joinMember(a, 'Luis')
    const c = await createContact(a.ctx, { name: 'Marta' })
    expect(await codeOf(assignContactToDelegate(a.ctx, c.id, b.ctx.actor.memberId))).toEqual({
      code: 'VALIDATION_FAILED',
      detail: 'INVALID_DELEGATE',
    })
    expect(
      await codeOf(assignContactToDelegate(luis.ctx, c.id, luis.ctx.actor.memberId)),
    ).toMatchObject({ code: 'FORBIDDEN' })
    expect(
      await codeOf(assignContactToDelegate(a.ctx, newId(), luis.ctx.actor.memberId)),
    ).toMatchObject({ code: 'NOT_FOUND' })
  })

  it('the database allows only one open assignment per contact', async () => {
    const admin = await adminWithOrg()
    const c = await createContact(admin.ctx, { name: 'Marta' })
    await expect(
      withTenant(db, admin.organization.id, (tx) =>
        tx.contactAssignment.create({
          data: {
            organizationId: admin.organization.id,
            contactId: c.id,
            delegateId: admin.ctx.actor.memberId,
          },
        }),
      ),
    ).rejects.toMatchObject({ code: 'P2002' })
  })
})

describe('visibility', () => {
  it('an admin sees every contact; a delegate only the ones they answer for', async () => {
    const admin = await adminWithOrg()
    const luis = await joinMember(admin, 'Luis')
    const ana = await joinMember(admin, 'Eva')
    const own = await createContact(luis.ctx, { name: 'De Luis' })
    const other = await createContact(ana.ctx, { name: 'De Eva' })
    const byAdmin = await createContact(admin.ctx, { name: 'Del admin' })

    expect((await listContacts(admin.ctx)).map((c) => c.id).sort()).toEqual(
      [own.id, other.id, byAdmin.id].sort(),
    )
    expect((await listContacts(luis.ctx)).map((c) => c.id)).toEqual([own.id])
    expect((await listContacts(ana.ctx)).map((c) => c.id)).toEqual([other.id])
  })

  it('what is not visible behaves as if it did not exist, in every use case', async () => {
    const admin = await adminWithOrg()
    const luis = await joinMember(admin, 'Luis')
    const hidden = await createContact(admin.ctx, { name: 'Del admin' })
    const notFound = { code: 'NOT_FOUND' }
    expect(await codeOf(getContact(luis.ctx, hidden.id))).toMatchObject(notFound)
    expect(await codeOf(updateContact(luis.ctx, hidden.id, { name: 'X' }))).toMatchObject(notFound)
    expect(await codeOf(markContactIdentified(luis.ctx, hidden.id))).toMatchObject(notFound)
    expect(await codeOf(listContactActivity(luis.ctx, hidden.id))).toMatchObject(notFound)
    expect(await codeOf(listAssignmentHistory(luis.ctx, hidden.id))).toMatchObject(notFound)
  })

  it('reassigning moves the visibility with the contact', async () => {
    const admin = await adminWithOrg()
    const luis = await joinMember(admin, 'Luis')
    const eva = await joinMember(admin, 'Eva')
    const c = await createContact(luis.ctx, { name: 'Marta' })
    expect(await listContacts(eva.ctx)).toHaveLength(0)
    await assignContactToDelegate(admin.ctx, c.id, eva.ctx.actor.memberId)
    expect(await listContacts(luis.ctx)).toHaveLength(0)
    expect((await listContacts(eva.ctx)).map((x) => x.id)).toEqual([c.id])
    expect(await codeOf(getContact(luis.ctx, c.id))).toMatchObject({ code: 'NOT_FOUND' })
  })
})

describe('tenant isolation', () => {
  it('one organization cannot read, edit or reassign the contacts of another', async () => {
    const a = await adminWithOrg()
    const b = await adminWithOrg()
    const c = await createContact(a.ctx, { name: 'De A' })
    expect(await listContacts(b.ctx)).toHaveLength(0)
    expect(await codeOf(getContact(b.ctx, c.id))).toMatchObject({ code: 'NOT_FOUND' })
    expect(await codeOf(updateContact(b.ctx, c.id, { name: 'X' }))).toMatchObject({
      code: 'NOT_FOUND',
    })
    expect(await codeOf(assignContactToDelegate(b.ctx, c.id, b.ctx.actor.memberId))).toMatchObject({
      code: 'NOT_FOUND',
    })
    const visibleToB = await withTenant(db, b.organization.id, (tx) =>
      tx.contact.count({ where: { organizationId: a.organization.id } }),
    )
    expect(visibleToB).toBe(0)
  })
})
