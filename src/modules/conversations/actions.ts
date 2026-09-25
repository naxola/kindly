"use server";

import { revalidatePath } from "next/cache";
import { requireCurrentOrganizationMember } from "@/modules/organizations/service";
import {
  sendOutboundMessage,
  reassignConversationContact,
  signalTyping,
  toThreadMessage,
  type ThreadMessage,
} from "@/modules/conversations/service";
import { markContactIdentified } from "@/modules/contacts/service";

export type SendReplyResult = { ok: true; message: ThreadMessage } | { ok: false; error: string };

/**
 * Called by the conversation screen after it has already shown the message
 * optimistically (PKG-013), so it returns the stored message instead of
 * re-rendering the page, and reports failure as a value the screen can put
 * next to that message rather than as an error page.
 *
 * No `revalidatePath` of the conversation itself: the screen owns its
 * thread state and polls for the rest.
 */
export async function sendReplyAction(conversationId: string, text: string): Promise<SendReplyResult> {
  const member = await requireCurrentOrganizationMember();
  const trimmed = text.trim();
  if (!trimmed) {
    return { ok: false, error: "El mensaje está vacío." };
  }

  try {
    const message = await sendOutboundMessage({
      organizationId: member.organizationId,
      actorUserId: member.userId,
      conversationId,
      text: trimmed,
    });
    revalidatePath("/inbox");
    return { ok: true, message: toThreadMessage(message) };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : "No se pudo enviar." };
  }
}

/** "Typing…" for the Contact (PKG-013); throttled by the screen, best effort on the server. */
export async function signalTypingAction(conversationId: string): Promise<void> {
  const member = await requireCurrentOrganizationMember();
  await signalTyping(member.organizationId, conversationId);
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
