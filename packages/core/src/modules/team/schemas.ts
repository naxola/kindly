import { z } from 'zod'
import {
  optionalEmail as email,
  optionalText,
  optionalUuid as positionId,
  phone,
} from '../../validation.ts'

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
