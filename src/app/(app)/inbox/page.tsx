import type { Metadata } from "next";
import { dehydrate, HydrationBoundary, QueryClient } from "@tanstack/react-query";
import { requireCurrentOrganizationMember } from "@/modules/organizations/service";
import { getInboxList, getInboxStaticData } from "@/app/(app)/inbox/inbox-data";
import { getConversationWorkspace } from "@/app/(app)/inbox/conversation-workspace-data";
import { parseConversationId, parseInboxFilters } from "@/app/(app)/inbox/inbox-filters";
import { inboxKeys } from "@/app/(app)/inbox/inbox-queries";
import { getFichaCollapsed } from "@/app/(app)/inbox/ficha-cookie";
import { InboxWorkspace } from "@/app/(app)/inbox/inbox-workspace";
import { pageTitle } from "@/lib/page-title";

export async function generateMetadata(): Promise<Metadata> {
  const member = await requireCurrentOrganizationMember();
  return { title: pageTitle("Conversaciones", member.organizationName) };
}

type SearchParams = Record<string, string | string[] | undefined>;

/**
 * The Inbox's only server render (docs/ui/CHAT.md §1): the first load (or a
 * refresh) of `/inbox`, with whatever filters and open conversation its
 * query string carries. It seeds the client cache with exactly that, so the
 * first paint is complete; from then on filtering, opening, switching and
 * closing conversations only change the query string client-side and read
 * from/refresh that cache — this page never renders again for them.
 */
export default async function InboxPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const raw = await searchParams;
  const params = { get: (name: string) => (typeof raw[name] === "string" ? (raw[name] as string) : null) };
  const filters = parseInboxFilters(params);
  const conversationId = parseConversationId(params);

  const member = await requireCurrentOrganizationMember();
  const [list, staticData, conversation, fichaCollapsed] = await Promise.all([
    getInboxList(member, filters),
    getInboxStaticData(member),
    // Opening it here is a real open (direct link or refresh), so it marks it read.
    conversationId ? getConversationWorkspace(member, conversationId, { markRead: true }) : null,
    getFichaCollapsed(),
  ]);

  const queryClient = new QueryClient();
  queryClient.setQueryData(inboxKeys.list(filters), list);
  if (conversationId && conversation) {
    queryClient.setQueryData(inboxKeys.conversation(conversationId), conversation);
  }

  return (
    <HydrationBoundary state={dehydrate(queryClient)}>
      <InboxWorkspace
        members={staticData.members}
        availableChannels={staticData.availableChannels}
        viewerId={member.userId}
        isAdmin={member.role === "ADMIN"}
        initialFichaCollapsed={fichaCollapsed}
      />
    </HydrationBoundary>
  );
}
