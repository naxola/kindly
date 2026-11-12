import { z } from 'zod'

/** Shared input normalizers: blank strings mean "no value", phones go to E.164. */

export const blankToNull = (v: unknown) => (typeof v === 'string' && v.trim() === '' ? null : v)

/** Optional text: blank means null; trimmed otherwise. */
export const optionalText = (max: number) =>
  z.preprocess(blankToNull, z.string().trim().max(max).nullable().optional())

/** E.164 after removing the separators people type (spaces, dots, dashes, parentheses). */
export const phone = z.preprocess(
  (v) => {
    const blank = blankToNull(v)
    return typeof blank === 'string' ? blank.replace(/[\s.\-()]/g, '') : blank
  },
  z
    .string()
    .regex(/^\+[1-9][0-9]{6,14}$/, 'Phone must be in international format, e.g. +34600111222')
    .nullable()
    .optional(),
)

export const optionalEmail = z.preprocess(
  blankToNull,
  z.email().trim().toLowerCase().max(254).nullable().optional(),
)

export const optionalUuid = z.preprocess(blankToNull, z.uuid().nullable().optional())
