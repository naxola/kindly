import type { Prisma } from '@saas/database'
import { can, type Actor } from '../identity/index.ts'

/**
 * Which contacts an actor may see. `where` fragment, not a post-filter: it goes inside the query,
 * so what is not visible never leaves the database (docs/DECISIONS.md, "Delegado de referencia y
 * acceso temporal").
 *
 * - With `contacts.read_all` (administrators): every contact of the organization.
 * - Otherwise: the contacts whose current reference delegate is the actor.
 *
 * Phase M6 adds the third rule ("temporary access": a delegate a contact has just written to
 * keeps seeing it until the reference delegate exchanges a message), which is derived from the
 * messages and needs the conversation tables. Until then there are no messages, so the rule
 * has nothing to derive. Every module that shows contact data (cases, tasks, conversations)
 * goes through this one function, so adding the rule there changes them all.
 */
export function contactVisibilityWhere(actor: Actor): Prisma.ContactWhereInput {
  if (can(actor, 'contacts.read_all')) return {}
  return { assignments: { some: { delegateId: actor.memberId, endedAt: null } } }
}
