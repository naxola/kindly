import { notFound } from "next/navigation";
import { requireCurrentOrganizationMember, listOrganizationMembers } from "@/modules/organizations/service";
import {
  channelSupportsTypingIndicator,
  getConversationThreadState,
  getConversationWithDetails,
  listConversationsWithPreview,
} from "@/modules/conversations/service";
import { listContactsForMember } from "@/modules/contacts/service";
import { getActiveAssignment, listAssignmentHistory } from "@/modules/contacts/assignments";
import { listCasesForContact } from "@/modules/cases/service";
import { listTasksForContact } from "@/modules/tasks/service";
import { markContactIdentifiedAction, reassignConversationContactAction } from "@/modules/conversations/actions";
import { getFichaCollapsed } from "@/app/(app)/inbox/ficha-cookie";
import { ConversationSheet } from "@/app/(app)/inbox/[id]/conversation-sheet";
import { ContactFicha } from "@/app/(app)/inbox/[id]/contact-ficha";

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
  const details = await getConversationWithDetails(member.organizationId, member, id);
  if (!details) {
    notFound();
  }

  const [threadState, members, contacts, activeAssignment, assignmentHistory, cases, tasks, otherConversations, fichaCollapsed] =
    await Promise.all([
      getConversationThreadState(member.organizationId, member, id),
      listOrganizationMembers(member.organizationId),
      listContactsForMember(member.organizationId, member),
      getActiveAssignment(member.organizationId, details.contact.id),
      listAssignmentHistory(member.organizationId, details.contact.id),
      listCasesForContact(member.organizationId, member, details.contact.id),
      listTasksForContact(member.organizationId, member, details.contact.id),
      listConversationsWithPreview(member.organizationId, member, { contactId: details.contact.id }),
      getFichaCollapsed(),
    ]);
  if (!threadState) {
    notFound();
  }

  const isAdmin = member.role === "ADMIN";
  const nameById = new Map(members.map((m) => [m.userId, m.name]));
  const delegateName = nameById.get(details.delegateId) ?? "—";
  const otherContacts = contacts.filter((c) => c.id !== details.contact.id).map((c) => ({ id: c.id, name: c.name }));
  const markContactIdentified = markContactIdentifiedAction.bind(null, details.contact.id, id);
  const canReply = details.delegateId === member.userId;
  const referenceDelegateName =
    details.referenceDelegateId && details.referenceDelegateId !== member.userId
      ? (nameById.get(details.referenceDelegateId) ?? "—")
      : undefined;

  return (
    <ConversationSheet
      conversationId={id}
      contact={{ id: details.contact.id, name: details.contact.name, isUnassigned: details.contact.isUnassigned }}
      channel={details.conversation.channel}
      delegateName={delegateName}
      canReply={canReply}
      referenceDelegateName={referenceDelegateName}
      threadState={threadState}
      supportsTyping={channelSupportsTypingIndicator(details.conversation.channel)}
      closeMode="back"
      closeHref="/inbox"
      initialFichaCollapsed={fichaCollapsed}
      ficha={
        <ContactFicha
          contact={details.contact}
          channel={details.conversation.channel}
          delegateName={delegateName}
          isAdmin={isAdmin}
          otherContacts={otherContacts}
          markContactIdentified={markContactIdentified}
          reassignConversation={reassignConversationContactAction.bind(null, id)}
          activeAssignment={activeAssignment}
          assignmentHistory={assignmentHistory}
          delegates={members.map((m) => ({ userId: m.userId, name: m.name }))}
          nameById={nameById}
          cases={cases}
          tasks={tasks}
          otherConversations={otherConversations.filter((c) => c.id !== id)}
        />
      }
    />
  );
}
