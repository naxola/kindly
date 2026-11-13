import { afterAll, describe, expect, it } from 'vitest'
import { ZodError } from 'zod'
import {
  createProcedure,
  getProcedure,
  listProcedures,
  publishProcedureVersion,
} from '../src/index.ts'
import { adminWithOrg, codeOf, db, joinMember } from './helpers.ts'

afterAll(async () => {
  await db.$disconnect()
})

describe('procedures', () => {
  it('creates a procedure with version 1 CURRENT, ordered steps and required documents', async () => {
    const admin = await adminWithOrg()
    const p = await createProcedure(admin.ctx, {
      name: ' Baja por IT ',
      description: '',
      steps: ['Recoger el parte', ' Registrarlo ', '', 'Recoger el parte'],
      requiredDocuments: ['Parte de baja', 'DNI', 'DNI'],
    })
    expect(p).toMatchObject({ name: 'Baja por IT', description: null })
    const full = await getProcedure(admin.ctx, p.id)
    expect(full.versions).toHaveLength(1)
    expect(full.versions[0]).toMatchObject({ version: 1, status: 'CURRENT' })
    expect(full.versions[0]?.steps.map((s) => [s.ordinal, s.title])).toEqual([
      [1, 'Recoger el parte'],
      [2, 'Registrarlo'],
    ])
    expect(full.versions[0]?.requiredDocuments.map((d) => d.name)).toEqual(['Parte de baja', 'DNI'])
  })

  it('a procedure can have no steps or documents; a name is required', async () => {
    const admin = await adminWithOrg()
    const p = await createProcedure(admin.ctx, { name: 'Vacío' })
    const v = (await getProcedure(admin.ctx, p.id)).versions[0]
    expect(v?.steps).toEqual([])
    expect(v?.requiredDocuments).toEqual([])
    await expect(createProcedure(admin.ctx, { name: '  ' })).rejects.toBeInstanceOf(ZodError)
  })

  it('publishing supersedes the previous CURRENT, keeps exactly one and never rewrites the old one', async () => {
    const admin = await adminWithOrg()
    const p = await createProcedure(admin.ctx, {
      name: 'Trámite',
      steps: ['Uno'],
      requiredDocuments: ['DNI'],
    })
    const v2 = await publishProcedureVersion(admin.ctx, p.id, {
      steps: ['Uno', 'Dos'],
      requiredDocuments: [],
    })
    expect(v2.version).toBe(2)
    const full = await getProcedure(admin.ctx, p.id)
    expect(full.versions.map((v) => [v.version, v.status])).toEqual([
      [2, 'CURRENT'],
      [1, 'SUPERSEDED'],
    ])
    expect(full.versions[1]?.steps.map((s) => s.title)).toEqual(['Uno'])
    expect(full.versions[1]?.requiredDocuments.map((d) => d.name)).toEqual(['DNI'])
  })

  it('concurrent publishes never repeat a version number', async () => {
    const admin = await adminWithOrg()
    const p = await createProcedure(admin.ctx, { name: 'Carrera' })
    await Promise.all(
      [1, 2, 3].map((n) => publishProcedureVersion(admin.ctx, p.id, { steps: [`paso ${n}`] })),
    )
    const full = await getProcedure(admin.ctx, p.id)
    expect(full.versions.map((v) => v.version)).toEqual([4, 3, 2, 1])
    expect(full.versions.filter((v) => v.status === 'CURRENT')).toHaveLength(1)
  })

  it('lists A-Z with the current version number', async () => {
    const admin = await adminWithOrg()
    const b = await createProcedure(admin.ctx, { name: 'Baja' })
    await createProcedure(admin.ctx, { name: 'Alta' })
    await publishProcedureVersion(admin.ctx, b.id, {})
    expect((await listProcedures(admin.ctx)).map((p) => [p.name, p.currentVersion])).toEqual([
      ['Alta', 1],
      ['Baja', 2],
    ])
  })

  it('everyone reads, only administrators write', async () => {
    const admin = await adminWithOrg()
    const luis = await joinMember(admin, 'Luis')
    const p = await createProcedure(admin.ctx, { name: 'Interno', requiredDocuments: ['DNI'] })
    expect((await listProcedures(luis.ctx)).map((x) => x.id)).toContain(p.id)
    expect((await getProcedure(luis.ctx, p.id)).versions[0]?.requiredDocuments).toHaveLength(1)
    expect(await codeOf(createProcedure(luis.ctx, { name: 'X' }))).toMatchObject({
      code: 'FORBIDDEN',
    })
    expect(await codeOf(publishProcedureVersion(luis.ctx, p.id, {}))).toMatchObject({
      code: 'FORBIDDEN',
    })
  })

  it('never reads or publishes across organizations', async () => {
    const a = await adminWithOrg()
    const b = await adminWithOrg()
    const p = await createProcedure(a.ctx, { name: 'Privado de A' })
    expect(await listProcedures(b.ctx)).toEqual([])
    expect(await codeOf(getProcedure(b.ctx, p.id))).toMatchObject({ code: 'NOT_FOUND' })
    expect(await codeOf(publishProcedureVersion(b.ctx, p.id, { steps: ['x'] }))).toMatchObject({
      code: 'NOT_FOUND',
    })
    expect((await getProcedure(a.ctx, p.id)).versions).toHaveLength(1)
  })
})
