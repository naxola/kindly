"use server";

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
 * No `revalidatePath` at all: the screen owns its thread state and the
 * Inbox list polls for itself (every 5 s) — revalidating `/inbox` here only
 * made Next re-render the whole Inbox page on the server after every sent
 * message, for props the already-mounted list never reads again.
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

/**
 * No `revalidatePath` (same reason as `sendReplyAction`): the conversation
 * panel is client-driven and reloads its own data after this resolves
 * (docs/ui/CHAT.md §1); the list picks it up on its next poll.
 */
export async function markContactIdentifiedAction(contactId: string) {
  const member = await requireCurrentOrganizationMember();
  await markContactIdentified(member.organizationId, member.userId, contactId);
}

export async function reassignConversationContactAction(conversationId: string, formData: FormData) {
  const member = await requireCurrentOrganizationMember();
  const targetContactId = String(formData.get("targetContactId") ?? "").trim();
  if (!targetContactId) {
    throw new Error("Target contact is required.");
  }

  await reassignConversationContact(member.organizationId, member.userId, conversationId, targetContactId);
}
