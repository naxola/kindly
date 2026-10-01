"use server";

import { revalidatePath } from "next/cache";
import { requireCurrentOrganizationMember } from "@/modules/organizations/service";
import { getContactForMember } from "@/modules/contacts/service";
import { createMembership, endMembership, updateMembership } from "@/modules/memberships/service";

/**
 * Who can edit a Contact's `Membership`: ADMIN plus "the delegates who
 * attend to that Contact" — explicitly the same visibility rule as the
 * ficha (`docs/ui/CONVERSATION_WORKSPACE.md` §5.1), i.e.
 * `contactVisibilityCondition` via `getContactForMember`. Reusing that
 * predicate means reaching `/contacts/[id]` (which already 404s on an
 * invisible Contact) is equivalent to being allowed to edit its
 * Membership — no separate `canEdit` flag to keep in sync.
 */
async function requireEditableContact(contactId: string) {
  const member = await requireCurrentOrganizationMember();
  const contact = await getContactForMember(member.organizationId, member, contactId);
  if (!contact) {
    throw new Error("No autorizado para editar la afiliación de este contacto.");
  }
  return member;
}

function readMembershipFields(formData: FormData) {
  const memberNumber = (formData.get("memberNumber") as string | null)?.trim() || null;
  const startedAtValue = (formData.get("startedAt") as string | null)?.trim();
  const feeMonth = (formData.get("feePaidUntil") as string | null)?.trim();
  return {
    memberNumber,
    startedAt: startedAtValue ? new Date(startedAtValue) : undefined,
    feePaidUntil: feeMonth ? `${feeMonth}-01` : null,
  };
}

export async function createMembershipAction(contactId: string, formData: FormData) {
  const member = await requireEditableContact(contactId);
  const fields = readMembershipFields(formData);

  await createMembership({
    organizationId: member.organizationId,
    actorUserId: member.userId,
    contactId,
    ...fields,
  });

  revalidatePath(`/contacts/${contactId}`);
}

export async function updateMembershipAction(contactId: string, formData: FormData) {
  const member = await requireEditableContact(contactId);
  const fields = readMembershipFields(formData);

  const updated = await updateMembership({
    organizationId: member.organizationId,
    actorUserId: member.userId,
    contactId,
    ...fields,
  });

  if (!updated) {
    throw new Error("Esta afiliación ya no está activa.");
  }

  revalidatePath(`/contacts/${contactId}`);
}

/** "Dar de baja". Returns `{ error }` instead of throwing, same reasoning as `assignContactToDelegateAction`: shown inside a `ConfirmDialog`, and a thrown Server Action error is redacted to a generic message in production. */
export async function endMembershipAction(contactId: string): Promise<{ error: string } | undefined> {
  const member = await requireEditableContact(contactId);

  try {
    await endMembership({ organizationId: member.organizationId, actorUserId: member.userId, contactId });
  } catch (error) {
    return { error: error instanceof Error ? error.message : "No se pudo dar de baja." };
  }

  revalidatePath(`/contacts/${contactId}`);
  return undefined;
}
