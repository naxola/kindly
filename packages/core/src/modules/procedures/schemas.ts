import { z } from 'zod'
import { optionalText } from '../../validation.ts'
import { normalizeList } from './domain.ts'

const list = (max: number, item: number) =>
  z.array(z.string().max(item)).max(max).default([]).transform(normalizeList)

/** The content of a version: its steps in order and the documents it requires. */
export const ProcedureContent = z.object({
  steps: list(100, 300),
  requiredDocuments: list(100, 300),
})

export const ProcedureInput = ProcedureContent.extend({
  name: z.string().trim().min(1).max(200),
  description: optionalText(2000),
})
export type ProcedureInput = z.input<typeof ProcedureInput>
export type ProcedureContentInput = z.input<typeof ProcedureContent>
