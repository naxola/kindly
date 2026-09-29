import { notFound } from "next/navigation";
import { requireCurrentOrganizationMember } from "@/modules/organizations/service";
import { getInboxListData, type InboxSearchParams } from "@/app/(app)/inbox/inbox-data";
import { getConversationWorkspace } from "@/app/(app)/inbox/conversation-workspace-data";
import { getFichaCollapsed } from "@/app/(app)/inbox/ficha-cookie";
import { InboxWorkspace } from "@/app/(app)/inbox/inbox-workspace";

/**
 * A direct load of `/inbox/<id>` (URL typed in, bookmarked, or a refresh).
 * Inside the Inbox, opening a conversation never comes through here — it
 * only updates the URL (docs/ui/CHAT.md §1) — so this is the one place the
 * panel's data is resolved on the server, and the only one that marks the
 * conversation read as part of rendering.
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
  const [conversation, listData, fichaCollapsed] = await Promise.all([
    getConversationWorkspace(member, id, { markRead: true }),
    getInboxListData(member, await searchParams),
    getFichaCollapsed(),
  ]);
  if (!conversation) {
    notFound();
  }

  const { filters, conversations, counts, members, availableChannels } = listData;
  return (
    <InboxWorkspace
      filters={filters}
      initialConversations={conversations}
      initialCounts={counts}
      members={members.map((m) => ({ userId: m.userId, name: m.name }))}
      viewerId={member.userId}
      isAdmin={member.role === "ADMIN"}
      availableChannels={availableChannels}
      initialConversation={conversation}
      initialFichaCollapsed={fichaCollapsed}
    />
  );
}
