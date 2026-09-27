import { notFound } from "next/navigation";
import { requireCurrentOrganizationMember, listOrganizationMembers } from "@/modules/organizations/service";
import {
  channelSupportsTypingIndicator,
  getConversationThreadState,
  getConversationWithDetails,
} from "@/modules/conversations/service";
import { listContacts } from "@/modules/contacts/service";
import { markContactIdentifiedAction, reassignConversationContactAction } from "@/modules/conversations/actions";
import { ConversationSheet } from "@/app/(app)/inbox/[id]/conversation-sheet";

/**
 * Intercepted route (docs/ui/CHAT.md §1): only ever reached by a soft
 * navigation from within `/inbox` — a direct load or refresh bypasses
 * interception entirely and renders `../../[id]/page.tsx` instead. Because
 * of that, closing always means `router.back()`: there is always a prior
 * `/inbox` history entry to return to.
 */
export default async function InterceptedConversationSheetPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const member = await requireCurrentOrganizationMember();
  const details = await getConversationWithDetails(member.organizationId, id);
  if (!details) {
    notFound();
  }

  const [threadState, members, contacts] = await Promise.all([
    getConversationThreadState(member.organizationId, id),
    listOrganizationMembers(member.organizationId),
    listContacts(member.organizationId),
  ]);
  if (!threadState) {
    notFound();
  }

  const delegateName = members.find((m) => m.userId === details.delegateId)?.name ?? "—";
  const otherContacts = contacts.filter((c) => c.id !== details.contact.id).map((c) => ({ id: c.id, name: c.name }));
  const markContactIdentified = markContactIdentifiedAction.bind(null, details.contact.id, id);

  return (
    <ConversationSheet
      conversationId={id}
      contact={{ id: details.contact.id, name: details.contact.name, isUnassigned: details.contact.isUnassigned }}
      channel={details.conversation.channel}
      delegateName={delegateName}
      otherContacts={otherContacts}
      threadState={threadState}
      supportsTyping={channelSupportsTypingIndicator(details.conversation.channel)}
      closeMode="back"
      closeHref="/inbox"
      markContactIdentified={markContactIdentified}
      reassignConversation={reassignConversationContactAction.bind(null, id)}
    />
  );
}
