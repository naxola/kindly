"use server";

import { revalidatePath } from "next/cache";
import { changeMemberRole, renameOrganization, requireOrganizationAdmin } from "@/modules/organizations/service";
import { createInvitation, revokeInvitation } from "@/modules/organizations/invitations";
import { recordActivity } from "@/modules/audit/service";
import type { OrganizationRole } from "@/modules/organizations/schema";

export async function inviteMemberAction(formData: FormData) {
  const member = await requireOrganizationAdmin();
  const email = String(formData.get("email") ?? "").trim();
  const role = String(formData.get("role") ?? "") as OrganizationRole;

  if (!email) {
    throw new Error("An email is required to invite someone.");
  }
  if (role !== "ADMIN" && role !== "DELEGATE") {
    throw new Error("Role must be ADMIN or DELEGATE.");
  }

  const invitation = await createInvitation({
    organizationId: member.organizationId,
    invitedByUserId: member.userId,
    email,
    role,
  });

  await recordActivity({
    organizationId: member.organizationId,
    type: "MEMBER_INVITED",
    actorUserId: member.userId,
    entityType: "organization",
    entityId: member.organizationId,
    metadata: { invitationId: invitation.id, email: invitation.email, role },
  });

  revalidatePath("/organization/members");
}

export async function revokeInvitationAction(invitationId: string) {
  const member = await requireOrganizationAdmin();
  const revoked = await revokeInvitation(member.organizationId, invitationId);

  // Null means it was not PENDING any more (already accepted, already
  // revoked, or not ours) — nothing happened, so nothing is logged.
  if (revoked) {
    await recordActivity({
      organizationId: member.organizationId,
      type: "INVITATION_REVOKED",
      actorUserId: member.userId,
      entityType: "organization",
      entityId: member.organizationId,
      metadata: { invitationId: revoked.id, email: revoked.email },
    });
  }

  revalidatePath("/organization/members");
}

/**
 * Binary in practice — only two roles exist — but takes the target role
 * explicitly rather than "toggle", so the caller (the row's `NativeSelect`)
 * stays the single source of truth for what was actually selected.
 *
 * Returns `{ error }` instead of throwing: a thrown Server Action error is
 * redacted to a generic message in a production build (`next build && next
 * start`, what E2E runs against) — only the digest crosses the wire, not
 * `error.message` (found via this action's own E2E test, which expected the
 * "must have at least one ADMIN" message inline and got React's #441 "no
 * message" placeholder instead). `docs/DECISIONS.md` and Next's own
 * guidance ("Handling expected errors") say to model this as a return
 * value; the caller (`ChangeRoleControl`) re-throws it locally so
 * `ConfirmDialog`'s existing "may throw" contract still works, since that
 * throw never crosses the server boundary.
 */
export async function changeMemberRoleAction(
  userId: string,
  role: OrganizationRole,
): Promise<{ error: string } | undefined> {
  const member = await requireOrganizationAdmin();

  let updated: { userId: string; role: OrganizationRole };
  try {
    updated = await changeMemberRole(member.organizationId, userId, role);
  } catch (error) {
    return { error: error instanceof Error ? error.message : "No se pudo cambiar el rol." };
  }

  await recordActivity({
    organizationId: member.organizationId,
    type: "MEMBER_ROLE_CHANGED",
    actorUserId: member.userId,
    entityType: "organization",
    entityId: member.organizationId,
    metadata: { userId: updated.userId, role: updated.role },
  });

  revalidatePath("/organization/members");
  return undefined;
}

export async function renameOrganizationAction(formData: FormData) {
  const member = await requireOrganizationAdmin();
  const name = String(formData.get("name") ?? "");
  await renameOrganization(member.organizationId, name);

  await recordActivity({
    organizationId: member.organizationId,
    type: "ORGANIZATION_RENAMED",
    actorUserId: member.userId,
    entityType: "organization",
    entityId: member.organizationId,
    metadata: { name: name.trim() },
  });

  revalidatePath("/organization");
}
