"use server";

import { revalidatePath } from "next/cache";
import { requireOrganizationAdmin } from "@/modules/organizations/service";
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

  revalidatePath("/members");
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

  revalidatePath("/members");
}
