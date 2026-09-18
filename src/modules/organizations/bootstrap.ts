import "server-only";
import { db } from "@/db/client";
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
export async function bootstrapOrganizationForUser(userId: string, userName: string) {
  const [organization] = await db
    .insert(organizations)
    .values({ name: `${userName}'s organization` })
    .returning();

  await db.insert(organizationMembers).values({
    organizationId: organization.id,
    userId,
    role: "ADMIN",
  });

  return organization;
}
