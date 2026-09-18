import "server-only";
import { db } from "@/db/client";
import { isPostgresUniqueViolation } from "@/db/errors";
import { organizationMembers, organizations } from "@/modules/organizations/schema";

/**
 * Minimal Organization bootstrap for PKG-002: every new user gets their own
 * Organization with the ADMIN role. Full organization management (invite
 * members, switch active organization, belong to several organizations) is
 * explicitly out of scope — see project/CURRENT_TASK.md Non-goals.
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
