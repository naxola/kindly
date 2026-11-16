import { newId, withTenant } from '@saas/database'
import { afterAll, describe, expect, it } from 'vitest'
import {
  applyDuplicateAffiliateRequest,
  authenticateIntegrationKey,
  confirmAffiliateRequest,
  confirmAllAffiliateRequests,
  countOpenAffiliateRequests,
  createIntegrationKey,
  discardAffiliateRequest,
  getContact,
  listContacts,
  listIntegrationKeys,
  listOpenAffiliateRequests,
  receiveAffiliateAlta,
  revokeIntegrationKey,
} from '../src/index.ts'
import { adminWithOrg, codeOf, db, joinMember, queue, type Org } from './helpers.ts'

afterAll(async () => {
  await db.$disconnect()
})

let seq = 0
/** A valid DNI shape, unique per call (fictitious data only). */
const dni = () =>
  `${String(10_000_000 + ++seq + Math.floor(Math.random() * 80_000_000)).slice(0, 8)}T`

const alta = (over: Record<string, unknown> = {}, afiliado: Record<string, unknown> = {}) => ({
  tipoSolicitud: 'alta',
  validoParaProcesar: true,
  errores: [],
  afiliado: {
    nombre: 'MARÍA',
    apellidos: 'PRUEBA GÓMEZ',
    dni: dni(),
    fechaNacimiento: '03-09-1982',
    telefono: '600111222',
    email: 'maria.prueba@example.test',
    afiliacion: { cuotaMensual: '11.5 €', sector: 'Educación' },
    ...afiliado,
  },
  ...over,
})

const receive = (org: Org, item: unknown) =>
  receiveAffiliateAlta({ db, correlationId: newId() }, org.organization.id, item)

describe('integration keys', () => {
  it('a key is shown once, deduces its organization, and stops working when revoked', async () => {
    const admin = await adminWithOrg()
    const { key, token } = await createIntegrationKey(admin.ctx, { name: 'n8n' })
    expect(token).toMatch(/^kly_/)
    expect(key.keyPrefix).toBe(token.slice(0, 8))
    expect(JSON.stringify(await listIntegrationKeys(admin.ctx))).not.toContain(token)

    expect(await authenticateIntegrationKey(db, token)).toEqual({
      organizationId: admin.organization.id,
      keyId: key.id,
    })
    expect((await listIntegrationKeys(admin.ctx))[0]!.lastUsedAt).toBeInstanceOf(Date)
    expect(await authenticateIntegrationKey(db, 'kly_unknown')).toBeNull()
    expect(await authenticateIntegrationKey(db, 'not-a-key')).toBeNull()

    await revokeIntegrationKey(admin.ctx, key.id)
    expect(await authenticateIntegrationKey(db, token)).toBeNull()
    expect(await codeOf(revokeIntegrationKey(admin.ctx, key.id))).toMatchObject({
      code: 'NOT_FOUND',
    })
  })

  it('only administrators manage keys, and only their own organization', async () => {
    const admin = await adminWithOrg()
    const luis = await joinMember(admin, 'Luis')
    expect(await codeOf(createIntegrationKey(luis.ctx, { name: 'x' }))).toMatchObject({
      code: 'FORBIDDEN',
    })
    const other = await adminWithOrg('Otra')
    const { key } = await createIntegrationKey(other.ctx, { name: 'ajena' })
    expect(await codeOf(revokeIntegrationKey(admin.ctx, key.id))).toMatchObject({
      code: 'NOT_FOUND',
    })
  })
})

describe('receiving altas', () => {
  it('creates the contact, its profile and an active affiliation, with no delegate until confirmed', async () => {
    const admin = await adminWithOrg()
    const luis = await joinMember(admin, 'Luis')
    const item = alta()
    const result = await receive(admin, item)
    expect(result).toMatchObject({ status: 'RECEIVED', repeated: false })

    const open = await listOpenAffiliateRequests(admin.ctx)
    expect(open.pending).toHaveLength(1)
    const request = open.pending[0]!
    expect(request.data).toMatchObject({
      firstName: 'María',
      lastName: 'Prueba Gómez',
      phoneE164: '+34600111222',
      monthlyFeeCents: 1150,
    })
    // The only delegate (an ADMIN is never proposed) is the proposal.
    expect(request.proposedDelegate?.memberId).toBe(luis.ctx.actor.memberId)

    const contact = await getContact(admin.ctx, request.contactId!)
    expect(contact.name).toBe('María Prueba Gómez')
    expect(contact.referenceDelegate).toBeNull()
    // A delegate does not see an alta that is not theirs yet.
    expect((await listContacts(luis.ctx)).map((c) => c.id)).not.toContain(contact.id)
    const profile = await withTenant(db, admin.organization.id, (tx) =>
      tx.affiliateProfile.findFirstOrThrow({ where: { contactId: contact.id } }),
    )
    expect(profile.monthlyFeeCents).toBe(1150)
    expect(profile.birthDate?.toISOString().slice(0, 10)).toBe('1982-09-03')
    const affiliation = await withTenant(db, admin.organization.id, (tx) =>
      tx.affiliation.findFirstOrThrow({ where: { contactId: contact.id } }),
    )
    expect(affiliation.status).toBe('ACTIVE')
    expect(await countOpenAffiliateRequests(admin.ctx)).toBe(1)
  })

  it('an invalid item is reported with its reasons and stores nothing', async () => {
    const admin = await adminWithOrg()
    const result = await receive(admin, alta({ tipoSolicitud: 'baja' }, { dni: '12' }))
    expect(result.status).toBe('INVALID')
    expect(result.status === 'INVALID' && result.errors.length).toBe(2)
    expect(await countOpenAffiliateRequests(admin.ctx)).toBe(0)
  })

  it('a resend while it waits answers with the same request; two at once create one', async () => {
    const admin = await adminWithOrg()
    const item = alta()
    const first = await receive(admin, item)
    const again = await receive(admin, item)
    expect(again).toMatchObject({ status: 'RECEIVED', repeated: true })
    expect(again.status !== 'INVALID' && first.status !== 'INVALID' && again.requestId).toBe(
      first.status !== 'INVALID' && first.requestId,
    )

    const raced = alta()
    const both = await Promise.all([receive(admin, raced), receive(admin, raced)])
    const ids = new Set(both.map((r) => (r.status === 'INVALID' ? null : r.requestId)))
    expect(ids.size).toBe(1)
    expect((await listOpenAffiliateRequests(admin.ctx)).pending).toHaveLength(2)
  })

  it('spreads several altas over the delegates by load, counting pending proposals', async () => {
    const admin = await adminWithOrg()
    const luis = await joinMember(admin, 'Luis')
    const ana = await joinMember(admin, 'Ana')
    await receive(admin, alta())
    await receive(admin, alta())
    const proposals = (await listOpenAffiliateRequests(admin.ctx)).pending.map(
      (r) => r.proposedDelegate?.memberId,
    )
    expect(new Set(proposals)).toEqual(new Set([luis.ctx.actor.memberId, ana.ctx.actor.memberId]))
  })

  it('keeps each organization apart', async () => {
    const a = await adminWithOrg()
    const b = await adminWithOrg('Otra')
    const item = alta()
    await receive(a, item)
    expect(await countOpenAffiliateRequests(b.ctx)).toBe(0)
    // The same DNI in another organization is a new affiliate there, not a duplicate.
    expect(await receive(b, item)).toMatchObject({ status: 'RECEIVED', repeated: false })
  })
})

describe("the administrator's decision", () => {
  it('confirming assigns the delegate (and can send the welcome); it is resolved once', async () => {
    const admin = await adminWithOrg()
    const luis = await joinMember(admin, 'Luis')
    await receive(admin, alta())
    const [request] = (await listOpenAffiliateRequests(admin.ctx)).pending
    const before = queue.of('contacts.welcome-email').length
    await confirmAffiliateRequest(admin.ctx, request!.id, {
      delegateId: luis.ctx.actor.memberId,
      notifyContact: true,
    })
    expect(queue.of('contacts.welcome-email')).toHaveLength(before + 1)
    const contact = await getContact(admin.ctx, request!.contactId!)
    expect(contact.referenceDelegate?.memberId).toBe(luis.ctx.actor.memberId)
    expect((await listContacts(luis.ctx)).map((c) => c.id)).toContain(contact.id)
    expect(
      await codeOf(
        confirmAffiliateRequest(admin.ctx, request!.id, { delegateId: luis.ctx.actor.memberId }),
      ),
    ).toEqual({ code: 'CONFLICT', detail: 'ALREADY_RESOLVED' })
    expect(await countOpenAffiliateRequests(admin.ctx)).toBe(0)
  })

  it('confirming with a member who is not active leaves the alta pending', async () => {
    const admin = await adminWithOrg()
    const other = await adminWithOrg('Otra')
    await receive(admin, alta())
    const [request] = (await listOpenAffiliateRequests(admin.ctx)).pending
    expect(
      await codeOf(
        confirmAffiliateRequest(admin.ctx, request!.id, { delegateId: other.ctx.actor.memberId }),
      ),
    ).toEqual({ code: 'VALIDATION_FAILED', detail: 'INVALID_DELEGATE' })
    expect((await listOpenAffiliateRequests(admin.ctx)).pending).toHaveLength(1)
  })

  it('confirms all the pending ones with their proposal', async () => {
    const admin = await adminWithOrg()
    await joinMember(admin, 'Luis')
    await receive(admin, alta())
    await receive(admin, alta())
    expect(await confirmAllAffiliateRequests(admin.ctx)).toEqual({ confirmed: 2 })
    expect(await countOpenAffiliateRequests(admin.ctx)).toBe(0)
  })

  it('discarding a pending alta removes what it created', async () => {
    const admin = await adminWithOrg()
    await receive(admin, alta())
    const [request] = (await listOpenAffiliateRequests(admin.ctx)).pending
    expect(await discardAffiliateRequest(admin.ctx, request!.id)).toEqual({ contactRemoved: true })
    expect(await codeOf(getContact(admin.ctx, request!.contactId!))).toMatchObject({
      code: 'NOT_FOUND',
    })
    expect(await codeOf(discardAffiliateRequest(admin.ctx, request!.id))).toEqual({
      code: 'CONFLICT',
      detail: 'ALREADY_RESOLVED',
    })
  })

  it('a known DNI becomes a duplicate that can update the affiliate or be discarded', async () => {
    const admin = await adminWithOrg()
    const luis = await joinMember(admin, 'Luis')
    const id = dni()
    await receive(admin, alta({}, { dni: id }))
    const [first] = (await listOpenAffiliateRequests(admin.ctx)).pending
    await confirmAffiliateRequest(admin.ctx, first!.id, { delegateId: luis.ctx.actor.memberId })

    const dup = await receive(admin, alta({}, { dni: id, apellidos: 'PRUEBA LÓPEZ' }))
    expect(dup).toMatchObject({ status: 'DUPLICATE', repeated: false })
    const open = await listOpenAffiliateRequests(admin.ctx)
    expect(open.pending).toHaveLength(0)
    expect(open.duplicates[0]?.duplicateOf?.contactId).toBe(first!.contactId)

    await applyDuplicateAffiliateRequest(admin.ctx, open.duplicates[0]!.id)
    const contact = await getContact(admin.ctx, first!.contactId!)
    expect(contact.name).toBe('María Prueba López')
    // The reference delegate does not change.
    expect(contact.referenceDelegate?.memberId).toBe(luis.ctx.actor.memberId)

    await receive(admin, alta({}, { dni: id }))
    const again = (await listOpenAffiliateRequests(admin.ctx)).duplicates[0]!
    expect(await discardAffiliateRequest(admin.ctx, again.id)).toEqual({ contactRemoved: false })
    expect((await getContact(admin.ctx, first!.contactId!)).name).toBe('María Prueba López')
  })

  it('delegates cannot see or resolve altas', async () => {
    const admin = await adminWithOrg()
    const luis = await joinMember(admin, 'Luis')
    await receive(admin, alta())
    const [request] = (await listOpenAffiliateRequests(admin.ctx)).pending
    expect(await codeOf(listOpenAffiliateRequests(luis.ctx))).toMatchObject({ code: 'FORBIDDEN' })
    expect(await codeOf(countOpenAffiliateRequests(luis.ctx))).toMatchObject({ code: 'FORBIDDEN' })
    expect(
      await codeOf(
        confirmAffiliateRequest(luis.ctx, request!.id, { delegateId: luis.ctx.actor.memberId }),
      ),
    ).toMatchObject({ code: 'FORBIDDEN' })
    expect(await codeOf(discardAffiliateRequest(luis.ctx, request!.id))).toMatchObject({
      code: 'FORBIDDEN',
    })
  })

  it('another organization cannot resolve them', async () => {
    const admin = await adminWithOrg()
    const other = await adminWithOrg('Otra')
    await receive(admin, alta())
    const [request] = (await listOpenAffiliateRequests(admin.ctx)).pending
    expect(await codeOf(discardAffiliateRequest(other.ctx, request!.id))).toMatchObject({
      code: 'NOT_FOUND',
    })
  })
})
