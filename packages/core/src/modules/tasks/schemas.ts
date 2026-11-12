import { z } from 'zod'
import { optionalDate, optionalText, optionalUuid } from '../../validation.ts'

/** Full replace of the editable fields: only the title is required. */
export const TaskInput = z.object({
  title: z.string().trim().min(1).max(200),
  description: optionalText(4000),
  contactId: optionalUuid,
  /** organization_members.id of whoever has to do it. */
  assigneeId: optionalUuid,
  dueDate: optionalDate,
})
export type TaskInput = z.input<typeof TaskInput>

export const UpdateTaskInput = TaskInput.extend({ completed: z.boolean() })
export type UpdateTaskInput = z.input<typeof UpdateTaskInput>
