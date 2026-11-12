import "server-only";
import { randomBytes } from "node:crypto";
import { and, desc, eq } from "drizzle-orm";
import { db } from "@/db/client";
import { recordActivity } from "@/modules/audit/service";
import { isPostgresUniqueViolation } from "@/db/errors";
import { users } from "@/modules/auth/schema";
import {
  organizationInvitations,
  organizationMembers,
  organizations,
  type OrganizationRole,
} from "@/modules/organizations/schema";

/**
 * Invitation persistence for PKG-006, deliberately free of any `auth`
 * import: `bootstrap.ts` calls into here from Better Auth's user-creation
 * hook, and `service.ts` (which does import `auth` for the session) would
 * otherwise create the same import cycle documented in service.ts.
 *
 * Permission checks do NOT live here — they belong to the callers in
 * `service.ts`, which know who is asking.
 */

/** Long enough that the invitation URL can be shared directly without being guessable. */
const TOKEN_BYTES = 32;
const DEFAULT_TTL_DAYS = 7;

/** Emails are compared case-insensitively; storing them lowercased keeps the partial unique index honest. */
export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

export interface CreateInvitationInput {
  organizationId: string;
  invitedByUserId: string;
  email: string;
  role: OrganizationRole;
  ttlDays?: number;
}

export async function createInvitation(input: CreateInvitationInput) {
  const email = normalizeEmail(input.email);
  if (!email) {
    throw new Error("An email is required to invite someone.");
  }

  const expiresAt = new Date(Date.now() + (input.ttlDays ?? DEFAULT_TTL_DAYS) * 24 * 60 * 60 * 1000);

  try {
    const [invitation] = await db
      .insert(organizationInvitations)
      .values({
        organizationId: input.organizationId,
        email,
        role: input.role,
        token: randomBytes(TOKEN_BYTES).toString("base64url"),
        invitedByUserId: input.invitedByUserId,
        expiresAt,
      })
      .returning();
    return invitation;
  } catch (error) {
    // The partial unique index on (organization_id, email) WHERE status =
    // 'PENDING' is what makes a double invite a clean error instead of two
    // live invitations racing to be accepted.
    if (isPostgresUniqueViolation(error)) {
      throw new Error("There is already a pending invitation for that email in this organization.");
    }
    throw error;
  }
}

export async function listInvitations(organizationId: string) {
  return db
    .select()
    .from(organizationInvitations)
    .where(eq(organizationInvitations.organizationId, organizationId))
    .orderBy(desc(organizationInvitations.createdAt));
}

export type InvitationUsability =
  | "USABLE"
  | "EXPIRED"
  | "REVOKED"
  | "ALREADY_ACCEPTED"
  /** The email already has an account, and a user belongs to exactly one Organization in this model. */
  | "EMAIL_ALREADY_REGISTERED";

export interface InvitationView {
  id: string;
  organizationId: string;
  organizationName: string;
  email: string;
  role: OrganizationRole;
  usability: InvitationUsability;
}

/**
 * Resolves an invitation for its public page. Returns null only when the
 * token matches nothing at all — every other outcome is a real invitation
 * whose state the page must explain rather than a generic error.
 */
export async function getInvitationByToken(token: string, now: Date = new Date()): Promise<InvitationView | null> {
  const [row] = await db
    .select({
      invitation: organizationInvitations,
      organizationName: organizations.name,
    })
    .from(organizationInvitations)
    .innerJoin(organizations, eq(organizations.id, organizationInvitations.organizationId))
    .where(eq(organizationInvitations.token, token))
    .limit(1);

  if (!row) {
    return null;
  }

  return {
    id: row.invitation.id,
    organizationId: row.invitation.organizationId,
    organizationName: row.organizationName,
    email: row.invitation.email,
    role: row.invitation.role,
    usability: await resolveUsability(row.invitation, now),
  };
}

async function resolveUsability(
  invitation: typeof organizationInvitations.$inferSelect,
  now: Date,
): Promise<InvitationUsability> {
  if (invitation.status === "REVOKED") {
    return "REVOKED";
  }
  if (invitation.status === "ACCEPTED") {
    return "ALREADY_ACCEPTED";
  }
  if (invitation.expiresAt.getTime() <= now.getTime()) {
    return "EXPIRED";
  }

  // Checked last because it is the only one that costs a query, and the
  // only one whose cause is outside the invitation itself: a user belongs
  // to exactly one Organization (UNIQUE(user_id) on organization_members),
  // so an address that already has an account cannot join another one. The
  // page says so explicitly instead of letting signup fail later.
  const [existingUser] = await db
    .select({ id: users.id })
    .from(users)
    .where(eq(users.email, invitation.email))
    .limit(1);

  return existingUser ? "EMAIL_ALREADY_REGISTERED" : "USABLE";
}

export async function revokeInvitation(organizationId: string, invitationId: string) {
  const [updated] = await db
    .update(organizationInvitations)
    .set({ status: "REVOKED", updatedAt: new Date() })
    .where(
      and(
        eq(organizationInvitations.organizationId, organizationId),
        eq(organizationInvitations.id, invitationId),
        // Revoking an already-accepted invitation would suggest it undoes
        // the membership, which it does not.
        eq(organizationInvitations.status, "PENDING"),
      ),
    )
    .returning();
  return updated ?? null;
}

/**
 * Turns a pending invitation into a membership, matched by the new
 * account's email. Called from the user-creation path, never from a UI
 * action — which is why it takes a userId rather than reading a session.
 *
 * Returns the organization joined, or null when this email had no usable
 * invitation (the ordinary case: someone signing up on their own).
 *
 * Membership insert and invitation update share a transaction so a failure
 * can never leave an invitation marked ACCEPTED without the membership it
 * was supposed to create.
 */
export async function acceptPendingInvitationForUser(
  userId: string,
  email: string,
  now: Date = new Date(),
): Promise<{ organizationId: string; role: OrganizationRole } | null> {
  const normalized = normalizeEmail(email);

  const [invitation] = await db
    .select()
    .from(organizationInvitations)
    .where(
      and(
        eq(organizationInvitations.email, normalized),
        eq(organizationInvitations.status, "PENDING"),
      ),
    )
    .orderBy(desc(organizationInvitations.createdAt))
    .limit(1);

  if (!invitation || invitation.expiresAt.getTime() <= now.getTime()) {
    return null;
  }

  try {
    const joined = await db.transaction(async (tx) => {
      await tx.insert(organizationMembers).values({
        organizationId: invitation.organizationId,
        userId,
        role: invitation.role,
      });

      await tx
        .update(organizationInvitations)
        .set({ status: "ACCEPTED", acceptedAt: now, acceptedByUserId: userId, updatedAt: now })
        .where(eq(organizationInvitations.id, invitation.id));

      return { organizationId: invitation.organizationId, role: invitation.role };
    });

    // Logged outside the transaction on purpose: the membership is the
    // fact that matters, and a failure to write the audit row must not
    // roll back someone's access to the organization they were invited to.
    await recordActivity({
      organizationId: joined.organizationId,
      type: "MEMBER_JOINED",
      actorUserId: userId,
      entityType: "organization",
      entityId: joined.organizationId,
      metadata: { invitationId: invitation.id, role: joined.role },
    });

    return joined;
  } catch (error) {
    // The user already belongs to an Organization (UNIQUE(user_id)) — they
    // cannot join a second one in this model. Leave the invitation pending
    // rather than marking it accepted against a membership that does not
    // exist.
    if (isPostgresUniqueViolation(error)) {
      return null;
    }
    throw error;
  }
}
