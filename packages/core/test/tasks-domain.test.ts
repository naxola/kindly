import { describe, expect, it } from 'vitest'
import { isTaskPending, TaskInput } from '../src/index.ts'

describe('tasks (no database)', () => {
  it('is pending exactly when it has no completedAt', () => {
    expect(isTaskPending({ completedAt: null })).toBe(true)
    expect(isTaskPending({ completedAt: new Date() })).toBe(false)
  })

  it('normalizes blanks to null and a date to an instant', () => {
    const parsed = TaskInput.parse({
      title: ' Hacer ',
      description: '  ',
      contactId: '',
      assigneeId: '',
      dueDate: '2026-12-01',
    })
    expect(parsed).toMatchObject({
      title: 'Hacer',
      description: null,
      contactId: null,
      assigneeId: null,
    })
    expect(parsed.dueDate?.toISOString()).toBe('2026-12-01T00:00:00.000Z')
  })
})
