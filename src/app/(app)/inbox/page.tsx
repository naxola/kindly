import type { Metadata } from "next";
import { requireCurrentOrganizationMember } from "@/modules/organizations/service";
import { getInboxListData, type InboxSearchParams } from "@/app/(app)/inbox/inbox-data";
import { InboxList } from "@/app/(app)/inbox/inbox-list";
import { pageTitle } from "@/lib/page-title";

export async function generateMetadata(): Promise<Metadata> {
  const member = await requireCurrentOrganizationMember();
  return { title: pageTitle("Conversaciones", member.organizationName) };
}

export default async function InboxPage({ searchParams }: { searchParams: Promise<InboxSearchParams> }) {
  const params = await searchParams;
  const member = await requireCurrentOrganizationMember();
  const { filters, conversations, counts, members, availableChannels } = await getInboxListData(member, params);

  // This markup never re-renders once a conversation opens via soft
  // navigation (the `@sheet` slot changes on its own) — `InboxList` owns its
  // own `flex-1`/width story for exactly that reason (docs/ui/CHAT.md §5),
  // reacting to a row click directly instead of waiting for that.
  return (
    // Remounts on every filter change (the key), so the poll/banner state
    // below never carries over from a different view/search — docs/ui/
    // INBOX.md §6.
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
  );
}
