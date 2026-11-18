import type { DeletionRules } from '../identity/index.ts'

/**
 * Kindly's rules for deleting an account (docs/DECISIONS.md, 2026-11-16), on top of the template's
 * (last ADMIN, paid subscription). Deleting deactivates the person's memberships, and in Kindly a
 * member can be what others depend on:
 *
 * - **REFERENCE_DELEGATE**: they are the reference delegate of at least one contact. An
 *   administrator reassigns those contacts first; otherwise they would be left answered by nobody.
 * - **CHANNEL_CONNECTED**: they own a messaging account that is not disconnected. It is their own
 *   number (product principle 1): it is disconnected first, so Kindly stops syncing it.
 *
 * The same rules run at the preview, at the request and again when the grace period ends.
 */
export const kindlyDeletionRules: DeletionRules = {
  async memberBlockers(tx, member) {
    const [contacts, channels] = await Promise.all([
      tx.contactAssignment.count({
        where: { organizationId: member.organizationId, delegateId: member.id, endedAt: null },
      }),
      tx.messagingAccount.count({
        where: {
          organizationId: member.organizationId,
          delegateId: member.id,
          status: { not: 'DISCONNECTED' },
        },
      }),
    ])
    return [
      ...(contacts > 0 ? ['REFERENCE_DELEGATE'] : []),
      ...(channels > 0 ? ['CHANNEL_CONNECTED'] : []),
    ]
  },
}
