"use server";

import { revalidatePath } from "next/cache";
import { requireCurrentOrganizationMember, requireOrganizationAdmin } from "@/modules/organizations/service";
import { createContact, updateContact } from "@/modules/contacts/service";
import { assignContactToDelegate } from "@/modules/contacts/assignments";

function readContactFields(formData: FormData) {
  const name = String(formData.get("name") ?? "").trim();
  if (!name) {
    throw new Error("Name is required.");
  }
  return {
    name,
    phoneE164: (formData.get("phoneE164") as string | null)?.trim() || null,
    email: (formData.get("email") as string | null)?.trim() || null,
    notes: (formData.get("notes") as string | null)?.trim() || null,
  };
}

export async function createContactAction(formData: FormData) {
  // Verified here, not just trusted from the (app) layout redirect — see
  // Next.js forms guide: "Always verify authentication and authorization
  // inside each Server Action."
  const member = await requireCurrentOrganizationMember();
  const fields = readContactFields(formData);

  await createContact({
    organizationId: member.organizationId,
    actorUserId: member.userId,
    ...fields,
  });

  revalidatePath("/contacts");
}

export async function updateContactAction(contactId: string, formData: FormData) {
  const member = await requireCurrentOrganizationMember();
  const fields = readContactFields(formData);

  const updated = await updateContact({
    organizationId: member.organizationId,
    actorUserId: member.userId,
    contactId,
    ...fields,
  });

  if (!updated) {
    throw new Error("Contact not found.");
  }

  revalidatePath("/contacts");
  revalidatePath(`/contacts/${contactId}`);
}

/**
 * "Reasignar" (PKG-014, ADMIN-only per `docs/DECISIONS.md`). Returns
 * `{ error }` instead of throwing, like `changeMemberRoleAction`
 * (`organizations/actions.ts`) — a thrown Server Action error is redacted
 * to a generic message in a production build, so an expected failure (e.g.
 * an id that slipped past the `<select>`'s own options) has to come back
 * as a value for `ReassignDelegateControl`'s `ConfirmDialog` to show.
 */
export async function assignContactToDelegateAction(
  contactId: string,
  delegateId: string,
): Promise<{ error: string } | undefined> {
  const member = await requireOrganizationAdmin();

  try {
    await assignContactToDelegate(member.organizationId, member.userId, contactId, delegateId);
  } catch (error) {
    return { error: error instanceof Error ? error.message : "No se pudo reasignar." };
  }

  revalidatePath(`/contacts/${contactId}`);
  return undefined;
}
