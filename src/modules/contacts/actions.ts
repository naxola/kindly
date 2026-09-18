"use server";

import { revalidatePath } from "next/cache";
import { requireCurrentOrganizationMember } from "@/modules/organizations/service";
import { createContact, updateContact } from "@/modules/contacts/service";

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
