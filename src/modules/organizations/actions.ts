"use server";

import { revalidatePath } from "next/cache";
import {
  changeMemberRole,
  renameOrganization,
  requireCurrentOrganizationMember,
  requireOrganizationAdmin,
} from "@/modules/organizations/service";
import { createInvitation, getPendingInvitation, revokeInvitation } from "@/modules/organizations/invitations";
import { buildInvitationEmail } from "@/modules/organizations/invitation-email";
import { appBaseUrl } from "@/modules/email/app-url";
import { sendEmail } from "@/modules/email/sender";
import { parseOptionalPhoneE164 } from "@/lib/phone";
import { updateMemberPhone } from "@/modules/organizations/service";
import { recordActivity } from "@/modules/audit/service";
import type { OrganizationRole } from "@/modules/organizations/schema";
import type { ActionFeedback } from "@/components/patterns/use-close-after-action";

/**
 * Emails the invitation link. Returns a user-facing warning on failure
 * instead of throwing: the invitation already exists and its link stays
 * copyable on the Members page, so a failed send must not look like a failed
 * invitation (nor a successful one — hence the explicit message).
 */
async function deliverInvitationEmail(
  invitation: { email: string; role: OrganizationRole; token: string; expiresAt: Date },
  member: { userName: string; organizationName: string },
): Promise<string | undefined> {
  try {
    await sendEmail(
      buildInvitationEmail({
        to: invitation.email,
        organizationName: member.organizationName,
        invitedByName: member.userName,
        role: invitation.role,
        url: `${appBaseUrl()}/invite/${invitation.token}`,
        expiresAt: invitation.expiresAt,
      }),
    );
    return undefined;
  } catch (error) {
    const reason = error instanceof Error ? error.message : "error desconocido";
    return `La invitación está creada, pero el email no se pudo enviar (${reason}). Copia el enlace de la tabla y pásaselo a mano.`;
  }
}

export async function inviteMemberAction(formData: FormData): Promise<ActionFeedback | void> {
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

  const warning = await deliverInvitationEmail(invitation, member);

  revalidatePath("/organization/members");
  return warning ? { warning } : undefined;
}

/** "Reenviar": sends the same pending invitation (same link, same expiry) again. */
export async function resendInvitationAction(invitationId: string): Promise<{ error: string } | undefined> {
  const member = await requireOrganizationAdmin();
  const invitation = await getPendingInvitation(member.organizationId, invitationId);
  if (!invitation) {
    return { error: "La invitación ya no está pendiente." };
  }
  const warning = await deliverInvitationEmail(invitation, member);
  return warning ? { error: warning } : undefined;
}

/**
 * A member's professional phone: each person edits their own, an ADMIN can
 * edit anyone's. Returns `{ error }` for expected failures (see
 * `changeMemberRoleAction` for why not throw).
 */
export async function updateMemberPhoneAction(
  userId: string,
  phone: string,
): Promise<{ error: string } | undefined> {
  const member = await requireCurrentOrganizationMember();
  if (member.userId !== userId && member.role !== "ADMIN") {
    return { error: "Solo puedes editar tu propio teléfono." };
  }

  const parsed = parseOptionalPhoneE164(phone);
  if (!parsed.ok) {
    return { error: "Teléfono no válido. Usa el formato internacional, por ejemplo +34600111222." };
  }

  const updated = await updateMemberPhone(member.organizationId, userId, parsed.value);
  if (!updated) {
    return { error: "Miembro no encontrado." };
  }

  await recordActivity({
    organizationId: member.organizationId,
    type: "MEMBER_PHONE_CHANGED",
    actorUserId: member.userId,
    entityType: "organization",
    entityId: member.organizationId,
    metadata: { userId },
  });

  revalidatePath("/organization/members");
  return undefined;
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
