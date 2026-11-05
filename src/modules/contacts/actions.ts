"use server";

import { revalidatePath } from "next/cache";
import { requireCurrentOrganizationMember, requireOrganizationAdmin } from "@/modules/organizations/service";
import { createContact, getContactForMember, updateContact } from "@/modules/contacts/service";
import { assignContactToDelegate } from "@/modules/contacts/assignments";
import { describeSkippedWelcome, sendContactWelcomeEmail } from "@/modules/contacts/welcome";
import type { ActionFeedback } from "@/components/patterns/use-close-after-action";

/**
 * Sends the welcome email and turns every outcome into a user-facing
 * warning (or nothing on success). The caller's main operation has already
 * succeeded by now, so a failed or skipped email must never look like a
 * failed creation/reassignment.
 */
async function sendWelcomeOrWarn(
  organizationId: string,
  actorUserId: string,
  contactId: string,
  force = false,
): Promise<string | undefined> {
  try {
    const result = await sendContactWelcomeEmail({ organizationId, actorUserId, contactId, force });
    return result.status === "SKIPPED" ? describeSkippedWelcome(result.reason) : undefined;
  } catch (error) {
    const reason = error instanceof Error ? error.message : "error desconocido";
    return `No se pudo enviar el email de bienvenida (${reason}). Puedes reintentarlo desde la ficha del afiliado.`;
  }
}

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

export async function createContactAction(formData: FormData): Promise<ActionFeedback | void> {
  // Verified here, not just trusted from the (app) layout redirect — see
  // Next.js forms guide: "Always verify authentication and authorization
  // inside each Server Action."
  const member = await requireCurrentOrganizationMember();
  const fields = readContactFields(formData);

  // Picking a delegate other than yourself is ADMIN-only (same rule as
  // "Reasignar", PKG-014). A DELEGATE's form has no selector, and a forged
  // value is rejected here rather than silently ignored.
  const requestedDelegateId = (formData.get("delegateId") as string | null)?.trim() || member.userId;
  if (requestedDelegateId !== member.userId && member.role !== "ADMIN") {
    return { error: "Solo un ADMIN puede asignar el afiliado a otro delegado." };
  }

  let contact;
  try {
    contact = await createContact({
      organizationId: member.organizationId,
      actorUserId: member.userId,
      delegateId: requestedDelegateId,
      ...fields,
    });
  } catch (error) {
    return { error: error instanceof Error ? error.message : "No se pudo crear el contacto." };
  }

  revalidatePath("/contacts");

  if (formData.get("sendWelcome") === "on") {
    const warning = await sendWelcomeOrWarn(member.organizationId, member.userId, contact.id);
    if (warning) {
      return { warning: `Afiliado creado. ${warning}` };
    }
  }
  return undefined;
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
  notifyContact = false,
): Promise<{ error?: string; warning?: string } | undefined> {
  const member = await requireOrganizationAdmin();

  try {
    await assignContactToDelegate(member.organizationId, member.userId, contactId, delegateId);
  } catch (error) {
    return { error: error instanceof Error ? error.message : "No se pudo reasignar." };
  }

  revalidatePath(`/contacts/${contactId}`);

  if (notifyContact) {
    const warning = await sendWelcomeOrWarn(member.organizationId, member.userId, contactId);
    if (warning) {
      return { warning: `Delegado reasignado. ${warning}` };
    }
  }
  return undefined;
}

/**
 * "Enviar/Reenviar bienvenida" on the affiliate's ficha. Anyone who can see
 * the Contact may send it (it only introduces the delegate already assigned).
 */
export async function sendContactWelcomeEmailAction(contactId: string): Promise<{ error: string } | undefined> {
  const member = await requireCurrentOrganizationMember();
  const visible = await getContactForMember(member.organizationId, member, contactId);
  if (!visible) {
    return { error: "Contacto no encontrado." };
  }

  const warning = await sendWelcomeOrWarn(member.organizationId, member.userId, contactId, true);
  revalidatePath(`/contacts/${contactId}`);
  return warning ? { error: warning } : undefined;
}
