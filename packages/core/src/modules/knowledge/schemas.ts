import { z } from 'zod'
import { optionalText } from '../../validation.ts'

const day = z.iso.date()

export const DocumentInput = z.object({
  title: z.string().trim().min(1).max(300),
  sourceType: z.enum(['MANUAL', 'PDF', 'WEB']).default('MANUAL'),
  sourceUrl: optionalText(2000),
  jurisdiction: optionalText(120),
  territory: optionalText(120),
  scope: optionalText(120),
})
export type DocumentInput = z.input<typeof DocumentInput>

export const ChunkSchema = z.object({
  ordinal: z.number().int().min(0),
  level: z.enum(['CHAPTER', 'SECTION', 'ARTICLE', 'PARAGRAPH', 'FRAGMENT']).optional(),
  label: z.string().max(300).nullish(),
  path: z.string().max(600).nullish(),
  content: z.string().trim().min(1).max(20_000),
})

export const VersionInput = z
  .object({
    version: z.string().trim().min(1).max(60),
    status: z.enum(['DRAFT', 'CURRENT', 'SUPERSEDED', 'REPEALED', 'HISTORICAL']).default('DRAFT'),
    effectiveFrom: day,
    effectiveUntil: day.nullish(),
    source: optionalText(600),
    chunks: z.array(ChunkSchema).max(5000),
  })
  .refine((v) => !v.effectiveUntil || v.effectiveUntil >= v.effectiveFrom, {
    path: ['effectiveUntil'],
    message: 'The validity cannot end before it starts',
  })
export type VersionInput = z.input<typeof VersionInput>
