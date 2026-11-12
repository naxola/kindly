import "server-only";
import { db } from "@/db/client";
import { isPostgresUniqueViolation } from "@/db/errors";
import { organizationMembers, organizations } from "@/modules/organizations/schema";
import { acceptPendingInvitationForUser } from "@/modules/organizations/invitations";

/**
 * Organization bootstrap. Through PKG-005 every new user got their own
 * Organization with the ADMIN role, full stop; PKG-006 adds the other way
 * in — accepting an invitation — via `ensureOrganizationForUser` below.
 * Belonging to several organizations at once remains out of scope
 * (`organization_members_user_unique`).
 *
 * Called from Better Auth's `databaseHooks.user.create.after`
 * (src/modules/auth/auth.ts) right after a user registers. Deliberately in
 * its own file, not in ./service.ts: ./service.ts imports the `auth`
 * instance (for session lookup), and auth.ts needs this function, so
 * keeping them together would create an import cycle.
 */
/**
 * Creates the Organization and its ADMIN membership inside one transaction,
 * and tolerates losing a race against a concurrent call for the *same*
 * user (this happens in practice: getCurrentOrganizationMember's self-heal
 * path can be invoked by more than one Server Component for the same
 * request, e.g. the (app) layout and the page it wraps, both hitting a
 * brand-new org-less session at once).
 *
 * `organization_members_user_unique` (schema.ts) is what makes this safe:
 * the loser's membership insert hits the unique constraint, the whole
 * transaction rolls back (so no orphaned `organizations` row survives), and
 * this returns `null` instead of throwing. The caller must re-query for the
 * winner's membership — see getCurrentOrganizationMember in ./service.ts.
 */
export async function bootstrapOrganizationForUser(
  userId: string,
  userName: string,
): Promise<{ id: string; name: string } | null> {
  try {
    return await db.transaction(async (tx) => {
      const [organization] = await tx
        .insert(organizations)
        .values({ name: `${userName}'s organization` })
        .returning();

      await tx.insert(organizationMembers).values({
        organizationId: organization.id,
        userId,
        role: "ADMIN",
      });

      return organization;
    });
  } catch (error) {
    if (isPostgresUniqueViolation(error)) {
      return null;
    }
    throw error;
  }
}

/**
 * The single entry point for "this user must end up in an Organization"
 * (PKG-006). Order matters: an invited address joins the inviting
 * Organization, and only a user with no invitation gets one of their own.
 * Before this existed, the user-creation hook always created a new
 * Organization, which made invitations impossible — the invitee ended up
 * as ADMIN of their own empty tenant.
 *
 * Used both by Better Auth's user-creation hook and by the self-heal path
 * in getCurrentOrganizationMember, so the two can never disagree about
 * what "has an organization" means.
 */
export async function ensureOrganizationForUser(
  userId: string,
  userName: string,
  userEmail: string,
): Promise<void> {
  const joined = await acceptPendingInvitationForUser(userId, userEmail);
  if (joined) {
    return;
  }
  await bootstrapOrganizationForUser(userId, userName);
}
