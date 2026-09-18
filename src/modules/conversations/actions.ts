"use server";

import { revalidatePath } from "next/cache";
import { requireCurrentOrganizationMember } from "@/modules/organizations/service";
import { sendOutboundMessage, reassignConversationContact } from "@/modules/conversations/service";
import { markContactIdentified } from "@/modules/contacts/service";

export async function sendReplyAction(conversationId: string, formData: FormData) {
  const member = await requireCurrentOrganizationMember();
  const text = String(formData.get("text") ?? "").trim();
  if (!text) {
    throw new Error("Reply text is required.");
  }

  await sendOutboundMessage({
    organizationId: member.organizationId,
    actorUserId: member.userId,
    conversationId,
    text,
  });

  revalidatePath(`/inbox/${conversationId}`);
  revalidatePath("/inbox");
}

export async function markContactIdentifiedAction(contactId: string, conversationId: string) {
  const member = await requireCurrentOrganizationMember();
  await markContactIdentified(member.organizationId, member.userId, contactId);

  revalidatePath(`/inbox/${conversationId}`);
  revalidatePath("/inbox");
}

export async function reassignConversationContactAction(conversationId: string, formData: FormData) {
  const member = await requireCurrentOrganizationMember();
  const targetContactId = String(formData.get("targetContactId") ?? "").trim();
  if (!targetContactId) {
    throw new Error("Target contact is required.");
  }

  await reassignConversationContact(member.organizationId, member.userId, conversationId, targetContactId);

  revalidatePath(`/inbox/${conversationId}`);
  revalidatePath("/inbox");
}
