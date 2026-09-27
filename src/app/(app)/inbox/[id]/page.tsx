import { notFound } from "next/navigation";
import { requireCurrentOrganizationMember } from "@/modules/organizations/service";
import {
  channelSupportsTypingIndicator,
  getConversationThreadState,
  getConversationWithDetails,
} from "@/modules/conversations/service";
import { listContacts } from "@/modules/contacts/service";
import { markContactIdentifiedAction, reassignConversationContactAction } from "@/modules/conversations/actions";
import { getInboxListData, type InboxSearchParams } from "@/app/(app)/inbox/inbox-data";
import { buildHref } from "@/app/(app)/inbox/inbox-href";
import { InboxList } from "@/app/(app)/inbox/inbox-list";
import { ConversationSheet } from "@/app/(app)/inbox/[id]/conversation-sheet";
import { PageContainer } from "@/components/patterns/page-container";
import { PageHeader } from "@/components/patterns/page-header";

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
  const details = await getConversationWithDetails(member.organizationId, id);
  if (!details) {
    notFound();
  }

  const [threadState, listData, contacts] = await Promise.all([
    getConversationThreadState(member.organizationId, id),
    getInboxListData(member, await searchParams),
    listContacts(member.organizationId),
  ]);
  if (!threadState) {
    notFound();
  }

  const { filters, conversations, counts, members, availableChannels } = listData;
  const delegateName = members.find((m) => m.userId === details.delegateId)?.name ?? "—";
  const otherContacts = contacts.filter((c) => c.id !== details.contact.id).map((c) => ({ id: c.id, name: c.name }));
  const closeHref = buildHref("/inbox", filters);

  return (
    <>
      <div className="h-full min-w-0 flex-1 overflow-y-auto">
        <PageContainer size="full">
          <PageHeader
            title="Inbox"
            description="Conversaciones de todos los canales conectados. El sistema decide el canal al responder"
          />
          <InboxList
            key={`${filters.view}:${filters.search}:${filters.channel}:${filters.delegateId}`}
            filters={filters}
            initialConversations={conversations}
            initialCounts={counts}
            members={members.map((m) => ({ userId: m.userId, name: m.name }))}
            isAdmin={member.role === "ADMIN"}
            availableChannels={availableChannels}
          />
        </PageContainer>
      </div>
      <ConversationSheet
        conversationId={id}
        contact={{ id: details.contact.id, name: details.contact.name, isUnassigned: details.contact.isUnassigned }}
        channel={details.conversation.channel}
        delegateName={delegateName}
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
