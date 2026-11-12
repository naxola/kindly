import { z } from 'zod'
import { blankToNull, optionalText } from '../../validation.ts'

/** A month as people pick it ("2026-09") or as a date ("2026-09-15"): stored as its first day. */
const month = z.preprocess((v) => {
  const blank = blankToNull(v)
  if (typeof blank !== 'string') return blank
  const m = /^(\d{4})-(0[1-9]|1[0-2])(?:-\d{2})?$/.exec(blank.trim())
  return m ? new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, 1)) : blank
}, z.date().nullable().optional())

/** A day ("2026-09-15") or a full instant. */
const day = z.preprocess(
  (v) => {
    const blank = blankToNull(v)
    return typeof blank === 'string' ? new Date(blank) : blank
  },
  z
    .date()
    .refine((d) => !Number.isNaN(d.getTime()), 'Invalid date')
    .nullable()
    .optional(),
)

export const AffiliationInput = z.object({
  memberNumber: optionalText(40),
  startedAt: day,
  feePaidUntil: month,
})
export type AffiliationInput = z.input<typeof AffiliationInput>
