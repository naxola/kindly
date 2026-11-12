import { z } from 'zod'

const blankToNull = (v: unknown) => (typeof v === 'string' && v.trim() === '' ? null : v)

/** Optional text: blank means null; trimmed otherwise. */
const optionalText = (max: number) =>
  z.preprocess(blankToNull, z.string().trim().max(max).nullable().optional())

/** E.164 after removing the separators people type (spaces, dots, dashes, parentheses). */
const phone = z.preprocess(
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

const email = z.preprocess(
  blankToNull,
  z.email().trim().toLowerCase().max(254).nullable().optional(),
)

const positionId = z.preprocess(blankToNull, z.uuid().nullable().optional())

/** What identifies a person inside an organization. Only the first name is required. */
export const PersonFields = z.object({
  firstName: z.string().trim().min(1).max(80),
  lastName: optionalText(120),
  phone,
  contactEmail: email,
})

/** Data an ADMIN chooses for a member: the person's fields plus position and notes. */
export const MemberProfileInput = PersonFields.extend({
  positionId,
  notes: optionalText(2000),
})
export type MemberProfileInput = z.input<typeof MemberProfileInput>

/** What each person can edit about themselves: no position, no notes. */
export const MyProfileInput = PersonFields
export type MyProfileInput = z.input<typeof MyProfileInput>

/** Profile data attached to an invitation (the contact email is the invited one). */
export const InvitationProfileInput = z.object({
  firstName: z.string().trim().min(1).max(80),
  lastName: optionalText(120),
  phone,
  positionId,
})
export type InvitationProfileInput = z.input<typeof InvitationProfileInput>

export const PositionName = z.string().trim().min(1).max(60)

export const CreatePositionInput = z.object({ name: PositionName })
export type CreatePositionInput = z.input<typeof CreatePositionInput>

export const UpdatePositionInput = z
  .object({
    name: PositionName.optional(),
    sortOrder: z.number().int().min(0).max(10_000).optional(),
  })
  .refine((v) => v.name !== undefined || v.sortOrder !== undefined, 'Nothing to update')
export type UpdatePositionInput = z.input<typeof UpdatePositionInput>
