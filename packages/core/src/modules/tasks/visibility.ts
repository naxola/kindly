import type { Prisma } from '@saas/database'
import { contactVisibilityWhere } from '../contacts/index.ts'
import { can, type Actor } from '../identity/index.ts'

/**
 * Which tasks an actor may see: those without a contact (a general task is for the whole
 * organization) and those whose contact they may see. With `contacts.read_all` there is no
 * filter at all. Written out explicitly: folding an empty contact filter into an `OR` with
 * "no contact" would silently hide every task that has one.
 */
export function taskVisibilityWhere(actor: Actor): Prisma.TaskWhereInput {
  if (can(actor, 'contacts.read_all')) return {}
  return { OR: [{ contactId: null }, { contact: contactVisibilityWhere(actor) }] }
}
