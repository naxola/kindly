import type { Prisma, TenantTx } from '@saas/database'
import { can, type Actor } from '../identity/index.ts'

/**
 * Which contacts an actor may see, as a `where` fragment: it goes inside the query, so what is not
 * visible never leaves the database (docs/DECISIONS.md, "Delegado de referencia y acceso
 * temporal"). Every module that shows contact data (tasks, conversations, affiliation...) goes
 * through this one function.
 *
 * - With `contacts.read_all` (administrators): every contact of the organization.
 * - Otherwise a contact is visible when either:
 *   1. the actor is its current reference delegate; or
 *   2. **temporary access**: the last message sent TO the actor (to any of their own accounts,
 *      inbound only) is more recent than the last message, in either direction, between the
 *      contact and its current reference delegate. A contact with no reference delegate falls
 *      back to "whoever it last wrote to can see it".
 *
 * Rule 2 is derived entirely from messages, conversations and accounts: no extra state that
 * could drift from what actually happened on the channel.
 */
export async function contactVisibilityWhere(
  tx: TenantTx,
  actor: Actor,
): Promise<Prisma.ContactWhereInput> {
  if (can(actor, 'contacts.read_all')) return {}
  const temporary = await temporaryAccessContactIds(tx, actor)
  return {
    OR: [
      { assignments: { some: { delegateId: actor.memberId, endedAt: null } } },
      ...(temporary.length > 0 ? [{ id: { in: temporary } }] : []),
    ],
  }
}

/** Contacts the actor sees only because they were the last one the contact wrote to. */
async function temporaryAccessContactIds(tx: TenantTx, actor: Actor): Promise<string[]> {
  const rows = await tx.$queryRaw<{ id: string }[]>`
    SELECT c.id FROM contacts c
    WHERE c.organization_id = ${actor.organizationId}::uuid
      AND (
        SELECT max(m.created_at)
        FROM messages m
        JOIN conversations conv ON conv.id = m.conversation_id
        JOIN messaging_accounts ma ON ma.id = conv.messaging_account_id
        WHERE conv.contact_id = c.id
          AND ma.delegate_id = ${actor.memberId}::uuid
          AND m.direction = 'INBOUND'
      ) > coalesce(
        (
          SELECT max(m2.created_at)
          FROM messages m2
          JOIN conversations conv2 ON conv2.id = m2.conversation_id
          JOIN messaging_accounts ma2 ON ma2.id = conv2.messaging_account_id
          JOIN contact_assignments ref ON ref.contact_id = c.id AND ref.ended_at IS NULL
          WHERE conv2.contact_id = c.id AND ma2.delegate_id = ref.delegate_id
        ),
        '-infinity'::timestamptz
      )`
  return rows.map((r) => r.id)
}
