import { notFound } from "next/navigation";
import { requireCurrentOrganizationMember } from "@/modules/organizations/service";
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
import { getInboxListData, type InboxSearchParams } from "@/app/(app)/inbox/inbox-data";
import { buildHref } from "@/app/(app)/inbox/inbox-href";
import { getFichaCollapsed } from "@/app/(app)/inbox/ficha-cookie";
import { InboxList } from "@/app/(app)/inbox/inbox-list";
import { ConversationSheet } from "@/app/(app)/inbox/[id]/conversation-sheet";
import { ContactFicha } from "@/app/(app)/inbox/[id]/contact-ficha";

/**
 * A direct load of `/inbox/<id>` (URL typed in, bookmarked, or a refresh):
 * interception does not apply here (docs/ui/CHAT.md §1), so this is the
 * *only* thing rendered for the route — it recreates the list-next-to-panel
 * layout itself instead of relying on `@sheet`, which falls back to null.
 * Closing goes back to `/inbox` with the current filters (`closeMode`
 * "push"): there is no soft-navigation history entry to pop.
 */
export default async function ConversationDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<InboxSearchParams>;
}) {
  const { id } = await params;
  const member = await requireCurrentOrganizationMember();
  const details = await getConversationWithDetails(member.organizationId, member, id);
  if (!details) {
    notFound();
  }

  const [threadState, listData, contacts, activeAssignment, assignmentHistory, cases, tasks, otherConversations, fichaCollapsed] =
    await Promise.all([
      getConversationThreadState(member.organizationId, member, id),
      getInboxListData(member, await searchParams),
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

  const { filters, conversations, counts, members, availableChannels } = listData;
  const isAdmin = member.role === "ADMIN";
  const nameById = new Map(members.map((m) => [m.userId, m.name]));
  const delegateName = nameById.get(details.delegateId) ?? "—";
  const otherContacts = contacts.filter((c) => c.id !== details.contact.id).map((c) => ({ id: c.id, name: c.name }));
  const closeHref = buildHref("/inbox", filters);
  // PKG-014: this Conversation's own account may not belong to the viewer
  // (they can still see it as the Contact's reference delegate, or via
  // "acceso temporal") — replying is only ever through your own number.
  const canReply = details.delegateId === member.userId;
  const referenceDelegateName =
    details.referenceDelegateId && details.referenceDelegateId !== member.userId
      ? (nameById.get(details.referenceDelegateId) ?? "—")
      : undefined;

  return (
    <>
      <InboxList
        key={`${filters.view}:${filters.search}:${filters.channel}:${filters.delegateId}`}
        filters={filters}
        initialConversations={conversations}
        initialCounts={counts}
        members={members.map((m) => ({ userId: m.userId, name: m.name }))}
        viewerId={member.userId}
        isAdmin={isAdmin}
        availableChannels={availableChannels}
      />
      <ConversationSheet
        conversationId={id}
        contact={{ id: details.contact.id, name: details.contact.name, isUnassigned: details.contact.isUnassigned }}
        channel={details.conversation.channel}
        delegateName={delegateName}
        canReply={canReply}
        referenceDelegateName={referenceDelegateName}
        threadState={threadState}
        supportsTyping={channelSupportsTypingIndicator(details.conversation.channel)}
        closeMode="push"
        closeHref={closeHref}
        initialFichaCollapsed={fichaCollapsed}
        ficha={
          <ContactFicha
            contact={details.contact}
            channel={details.conversation.channel}
            delegateName={delegateName}
            isAdmin={isAdmin}
            otherContacts={otherContacts}
            markContactIdentified={markContactIdentifiedAction.bind(null, details.contact.id, id)}
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
    </>
  );
}
