import { z } from 'zod'
import { optionalEmail, optionalText, phone } from '../../validation.ts'

/** Full replace of the editable fields: only the name is required. */
export const ContactInput = z.object({
  name: z.string().trim().min(1).max(160),
  phone,
  email: optionalEmail,
  notes: optionalText(4000),
})
export type ContactInput = z.input<typeof ContactInput>

/**
 * Creating also chooses the reference delegate (by default, whoever creates it; another member
 * needs `contacts.assign`) and whether to send the welcome email that introduces them.
 */
export const ContactCreateInput = ContactInput.extend({
  delegateId: z.uuid().optional(),
  sendWelcome: z.boolean().default(false),
})
export type ContactCreateInput = z.input<typeof ContactCreateInput>
