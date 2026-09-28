import { notFound } from "next/navigation";
import { requireCurrentOrganizationMember } from "@/modules/organizations/service";
import {
  channelSupportsTypingIndicator,
  getConversationThreadState,
  getConversationWithDetails,
} from "@/modules/conversations/service";
import { listContactsForMember } from "@/modules/contacts/service";
import { markContactIdentifiedAction, reassignConversationContactAction } from "@/modules/conversations/actions";
import { getInboxListData, type InboxSearchParams } from "@/app/(app)/inbox/inbox-data";
import { buildHref } from "@/app/(app)/inbox/inbox-href";
import { InboxList } from "@/app/(app)/inbox/inbox-list";
import { ConversationSheet } from "@/app/(app)/inbox/[id]/conversation-sheet";

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

  const [threadState, listData, contacts] = await Promise.all([
    getConversationThreadState(member.organizationId, member, id),
    getInboxListData(member, await searchParams),
    listContactsForMember(member.organizationId, member),
  ]);
  if (!threadState) {
    notFound();
  }

  const { filters, conversations, counts, members, availableChannels } = listData;
  const delegateName = members.find((m) => m.userId === details.delegateId)?.name ?? "—";
  const otherContacts = contacts.filter((c) => c.id !== details.contact.id).map((c) => ({ id: c.id, name: c.name }));
  const closeHref = buildHref("/inbox", filters);
  // PKG-014: this Conversation's own account may not belong to the viewer
  // (they can still see it as the Contact's reference delegate, or via
  // "acceso temporal") — replying is only ever through your own number.
  const canReply = details.delegateId === member.userId;
  const referenceDelegateName =
    details.referenceDelegateId && details.referenceDelegateId !== member.userId
      ? (members.find((m) => m.userId === details.referenceDelegateId)?.name ?? "—")
      : undefined;

  return (
    <>
      <div className="flex h-full min-w-0 flex-1">
        <InboxList
          key={`${filters.view}:${filters.search}:${filters.channel}:${filters.delegateId}`}
          filters={filters}
          initialConversations={conversations}
          initialCounts={counts}
          members={members.map((m) => ({ userId: m.userId, name: m.name }))}
          viewerId={member.userId}
          isAdmin={member.role === "ADMIN"}
          availableChannels={availableChannels}
        />
      </div>
      <ConversationSheet
        conversationId={id}
        contact={{ id: details.contact.id, name: details.contact.name, isUnassigned: details.contact.isUnassigned }}
        channel={details.conversation.channel}
        delegateName={delegateName}
        canReply={canReply}
        referenceDelegateName={referenceDelegateName}
        otherContacts={otherContacts}
        threadState={threadState}
        supportsTyping={channelSupportsTypingIndicator(details.conversation.channel)}
        closeMode="push"
        closeHref={closeHref}
        markContactIdentified={markContactIdentifiedAction.bind(null, details.contact.id, id)}
        reassignConversation={reassignConversationContactAction.bind(null, id)}
      />
    </>
  );
}
