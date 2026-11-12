import { newId, withTenant } from '@saas/database'
import { afterAll, describe, expect, it } from 'vitest'
import { ZodError } from 'zod'
import {
  assignContactToDelegate,
  createContact,
  createTask,
  getTask,
  listTaskActivity,
  listTasks,
  setTaskCompleted,
  updateTask,
} from '../src/index.ts'
import { adminWithOrg, codeOf, db, joinMember } from './helpers.ts'

afterAll(async () => {
  await db.$disconnect()
})

describe('creating and editing', () => {
  it('creates a task with a contact, an assignee and a due date, and records TASK_CREATED', async () => {
    const admin = await adminWithOrg('Ana López')
    const luis = await joinMember(admin, 'Luis')
    const contact = await createContact(admin.ctx, { name: 'Marta' })
    const task = await createTask(admin.ctx, {
      title: ' Llamar a Marta ',
      description: '',
      contactId: contact.id,
      assigneeId: luis.ctx.actor.memberId,
      dueDate: '2026-12-01',
    })
    expect(task).toMatchObject({
      title: 'Llamar a Marta',
      description: null,
      completedAt: null,
      contact: { id: contact.id, name: 'Marta' },
      assignee: { memberId: luis.ctx.actor.memberId, name: 'Luis' },
    })
    expect(task.dueDate?.toISOString().slice(0, 10)).toBe('2026-12-01')
    const timeline = await listTaskActivity(admin.ctx, task.id)
    expect(timeline.map((a) => [a.type, a.actorName])).toEqual([['TASK_CREATED', 'Ana López']])
  })

  it('only the title is required', async () => {
    const admin = await adminWithOrg()
    const task = await createTask(admin.ctx, { title: 'Revisar archivo' })
    expect(task).toMatchObject({ contact: null, assignee: null, dueDate: null })
    await expect(createTask(admin.ctx, { title: '  ' })).rejects.toBeInstanceOf(ZodError)
    await expect(createTask(admin.ctx, { title: 'X', dueDate: 'mañana' })).rejects.toBeInstanceOf(
      ZodError,
    )
  })

  it('refuses a contact that is not visible or an assignee outside the organization', async () => {
    const a = await adminWithOrg()
    const b = await adminWithOrg()
    const luis = await joinMember(a, 'Luis')
    const hidden = await createContact(a.ctx, { name: 'Del admin' })
    const foreign = await createContact(b.ctx, { name: 'Ajeno' })
    expect(await codeOf(createTask(luis.ctx, { title: 'X', contactId: hidden.id }))).toEqual({
      code: 'VALIDATION_FAILED',
      detail: 'INVALID_CONTACT',
    })
    expect(await codeOf(createTask(a.ctx, { title: 'X', contactId: foreign.id }))).toEqual({
      code: 'VALIDATION_FAILED',
      detail: 'INVALID_CONTACT',
    })
    expect(
      await codeOf(createTask(a.ctx, { title: 'X', assigneeId: b.ctx.actor.memberId })),
    ).toEqual({ code: 'VALIDATION_FAILED', detail: 'INVALID_ASSIGNEE' })
    expect(await withTenant(db, a.organization.id, (tx) => tx.task.count())).toBe(0)
  })

  it('replaces the fields on update and keeps the first completion date', async () => {
    const admin = await adminWithOrg()
    const task = await createTask(admin.ctx, { title: 'Uno', description: 'a' })
    const done = await updateTask(admin.ctx, task.id, { title: 'Dos', completed: true })
    expect(done).toMatchObject({ title: 'Dos', description: null })
    expect(done.completedAt).not.toBeNull()
    // Saving again while completed does not move the completion date nor repeat the activity.
    const again = await updateTask(admin.ctx, task.id, { title: 'Tres', completed: true })
    expect(again.completedAt?.getTime()).toBe(done.completedAt?.getTime())
    const types = (await listTaskActivity(admin.ctx, task.id)).map((a) => a.type)
    expect(types).toEqual(['TASK_COMPLETED', 'TASK_CREATED'])
    expect(
      (await updateTask(admin.ctx, task.id, { title: 'Tres', completed: false })).completedAt,
    ).toBeNull()
  })
})

describe('completing', () => {
  it('logs TASK_COMPLETED exactly once and can be reopened', async () => {
    const admin = await adminWithOrg()
    const task = await createTask(admin.ctx, { title: 'Algo' })
    await setTaskCompleted(admin.ctx, task.id, true)
    await setTaskCompleted(admin.ctx, task.id, true)
    const types = (await listTaskActivity(admin.ctx, task.id)).map((a) => a.type)
    expect(types.filter((t) => t === 'TASK_COMPLETED')).toHaveLength(1)
    expect((await setTaskCompleted(admin.ctx, task.id, false)).completedAt).toBeNull()
    expect((await listTasks(admin.ctx, { status: 'pending' })).map((t) => t.id)).toEqual([task.id])
    expect(await listTasks(admin.ctx, { status: 'done' })).toHaveLength(0)
  })
})

describe('visibility', () => {
  it('a general task is for everyone; one with a contact follows the contact', async () => {
    const admin = await adminWithOrg()
    const luis = await joinMember(admin, 'Luis')
    const own = await createContact(luis.ctx, { name: 'De Luis' })
    const theirs = await createContact(admin.ctx, { name: 'Del admin' })
    const general = await createTask(admin.ctx, { title: 'General' })
    const onOwn = await createTask(luis.ctx, { title: 'Con su contacto', contactId: own.id })
    const onTheirs = await createTask(admin.ctx, { title: 'Con otro', contactId: theirs.id })

    expect((await listTasks(admin.ctx)).map((t) => t.id).sort()).toEqual(
      [general.id, onOwn.id, onTheirs.id].sort(),
    )
    expect((await listTasks(luis.ctx)).map((t) => t.id).sort()).toEqual(
      [general.id, onOwn.id].sort(),
    )
    expect(await codeOf(getTask(luis.ctx, onTheirs.id))).toMatchObject({ code: 'NOT_FOUND' })
    expect(
      await codeOf(updateTask(luis.ctx, onTheirs.id, { title: 'X', completed: true })),
    ).toMatchObject({ code: 'NOT_FOUND' })
    expect(await codeOf(setTaskCompleted(luis.ctx, onTheirs.id, true))).toMatchObject({
      code: 'NOT_FOUND',
    })
    expect(await codeOf(listTaskActivity(luis.ctx, onTheirs.id))).toMatchObject({
      code: 'NOT_FOUND',
    })
  })

  it('reassigning the contact moves its tasks with it', async () => {
    const admin = await adminWithOrg()
    const luis = await joinMember(admin, 'Luis')
    const contact = await createContact(luis.ctx, { name: 'Marta' })
    const task = await createTask(luis.ctx, { title: 'Seguimiento', contactId: contact.id })
    await assignContactToDelegate(admin.ctx, contact.id, admin.ctx.actor.memberId)
    expect(await listTasks(luis.ctx)).toHaveLength(0)
    expect(await codeOf(getTask(luis.ctx, task.id))).toMatchObject({ code: 'NOT_FOUND' })
    expect((await getTask(admin.ctx, task.id)).id).toBe(task.id)
  })
})

describe('tenant isolation', () => {
  it('one organization cannot read or edit the tasks of another', async () => {
    const a = await adminWithOrg()
    const b = await adminWithOrg()
    const task = await createTask(a.ctx, { title: 'De A' })
    expect(await listTasks(b.ctx)).toHaveLength(0)
    expect(await codeOf(getTask(b.ctx, task.id))).toMatchObject({ code: 'NOT_FOUND' })
    expect(await codeOf(updateTask(b.ctx, task.id, { title: 'X', completed: true }))).toMatchObject(
      { code: 'NOT_FOUND' },
    )
    expect(await codeOf(getTask(b.ctx, newId()))).toMatchObject({ code: 'NOT_FOUND' })
  })
})
