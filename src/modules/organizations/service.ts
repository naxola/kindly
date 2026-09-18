import "server-only";
import { headers } from "next/headers";
import { and, eq } from "drizzle-orm";
import { db } from "@/db/client";
import { auth } from "@/modules/auth/auth";
import { users } from "@/modules/auth/schema";
import { organizationMembers, organizations, type OrganizationRole } from "@/modules/organizations/schema";

// bootstrapOrganizationForUser lives in ./bootstrap.ts, not here: auth.ts
// needs it (databaseHooks.user.create.after) and this file imports `auth`,
// so keeping them together would create an import cycle.
import { bootstrapOrganizationForUser } from "@/modules/organizations/bootstrap";
export { bootstrapOrganizationForUser };

export interface CurrentOrganizationMember {
  userId: string;
  userName: string;
  userEmail: string;
  organizationId: string;
  organizationName: string;
  role: OrganizationRole;
}

/**
 * Resolves the signed-in user's session and their organization membership
 * in one call. Every module in PKG-002 (Contacts/Cases/Tasks/Activities)
 * goes through this instead of trusting a client-supplied organizationId —
 * this is the multi-tenant isolation boundary (CLAUDE.md sección 5).
 *
 * Because a user only ever has one Organization in PKG-002 (bootstrap
 * above), "first membership found" is unambiguous. This assumption breaks
 * once multi-organization membership ships — whichever package adds that
 * must replace this function, not add a parameter that can be spoofed by
 * the caller.
 */
export async function getCurrentOrganizationMember(): Promise<CurrentOrganizationMember | null> {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) {
    return null;
  }

  const membership = await findMembership(session.user.id);
  if (membership) {
    return {
      userId: session.user.id,
      userName: session.user.name,
      userEmail: session.user.email,
      organizationId: membership.organizationId,
      organizationName: membership.organizationName,
      role: membership.role,
    };
  }

  // Self-heal: a session with no organization membership should not exist
  // in PKG-002's model (every user gets one at signup — see
  // databaseHooks.user.create.after in auth.ts), but it can for accounts
  // created before that hook shipped, or if the hook ever fails. Without
  // this, such a user gets bounced back to /login with no error message
  // after a *correct* login, which is indistinguishable from a wrong
  // password — see docs/DECISIONS.md for the incident this fixes.
  await bootstrapOrganizationForUser(session.user.id, session.user.name);
  const healed = await findMembership(session.user.id);
  if (!healed) {
    // Only reachable if the insert itself failed (e.g. DB unavailable) —
    // bootstrapOrganizationForUser would have thrown in that case, so this
    // is unreachable in practice. Kept for type-safety, not as a real path.
    return null;
  }

  return {
    userId: session.user.id,
    userName: session.user.name,
    userEmail: session.user.email,
    organizationId: healed.organizationId,
    organizationName: healed.organizationName,
    role: healed.role,
  };
}

async function findMembership(userId: string) {
  const [membership] = await db
    .select({
      organizationId: organizationMembers.organizationId,
      role: organizationMembers.role,
      organizationName: organizations.name,
    })
    .from(organizationMembers)
    .innerJoin(organizations, eq(organizations.id, organizationMembers.organizationId))
    .where(eq(organizationMembers.userId, userId))
    .limit(1);
  return membership ?? null;
}

/**
 * Throwing variant for Server Actions/Components that require a session —
 * keeps call sites from having to repeat the null check and redirect logic.
 */
export async function requireCurrentOrganizationMember(): Promise<CurrentOrganizationMember> {
  const member = await getCurrentOrganizationMember();
  if (!member) {
    throw new Error("Not authenticated or missing organization membership.");
  }
  return member;
}

/**
 * Members of an organization, for populating "assign to" dropdowns in
 * Cases/Tasks. Only user id/name/email — never anything from `sessions`/
 * `accounts`.
 */
export async function listOrganizationMembers(organizationId: string) {
  return db
    .select({
      userId: organizationMembers.userId,
      role: organizationMembers.role,
      name: users.name,
      email: users.email,
    })
    .from(organizationMembers)
    .innerJoin(users, eq(users.id, organizationMembers.userId))
    .where(eq(organizationMembers.organizationId, organizationId));
}

/**
 * Defense in depth for assignment fields (Case.assignedTo, Task.assignedTo):
 * never let a Case/Task be assigned to a user outside the organization, even
 * though the UI only ever offers valid members as options.
 */
export async function isOrganizationMember(organizationId: string, userId: string): Promise<boolean> {
  const [row] = await db
    .select({ userId: organizationMembers.userId })
    .from(organizationMembers)
    .where(and(eq(organizationMembers.organizationId, organizationId), eq(organizationMembers.userId, userId)))
    .limit(1);
  return Boolean(row);
}
