import type { Metadata } from "next";
import { requireCurrentOrganizationMember, listOrganizationMembers } from "@/modules/organizations/service";
import {
  countConversationsByView,
  listConversationChannels,
  listConversationsWithPreview,
  type InboxView,
} from "@/modules/conversations/service";
import { InboxList } from "@/app/(app)/inbox/inbox-list";
import { PageContainer } from "@/components/patterns/page-container";
import { PageHeader } from "@/components/patterns/page-header";
import { pageTitle } from "@/lib/page-title";

const VALID_VIEWS: InboxView[] = ["pending", "unread", "unassigned", "all"];

function parseView(value: string | undefined): InboxView {
  return VALID_VIEWS.includes(value as InboxView) ? (value as InboxView) : "pending";
}

export async function generateMetadata(): Promise<Metadata> {
  const member = await requireCurrentOrganizationMember();
  return { title: pageTitle("Inbox", member.organizationName) };
}

export default async function InboxPage({
  searchParams,
}: {
  searchParams: Promise<{ view?: string; search?: string; channel?: string; delegateId?: string }>;
}) {
  const params = await searchParams;
  const member = await requireCurrentOrganizationMember();

  const filters = {
    view: parseView(params.view),
    search: params.search?.trim() ?? "",
    channel: params.channel?.trim() ?? "",
    delegateId: params.delegateId?.trim() ?? "",
  };

  const [conversations, counts, members, availableChannels] = await Promise.all([
    listConversationsWithPreview(member.organizationId, {
      view: filters.view,
      search: filters.search || undefined,
      channel: filters.channel || undefined,
      delegateId: filters.delegateId || undefined,
    }),
    countConversationsByView(member.organizationId, {
      channel: filters.channel || undefined,
      delegateId: filters.delegateId || undefined,
    }),
    listOrganizationMembers(member.organizationId),
    listConversationChannels(member.organizationId),
  ]);

  return (
    <PageContainer size="full">
      <PageHeader
        title="Inbox"
        description="Conversaciones de todos los canales conectados. El sistema decide el canal al responder"
      />

      {/* Remounts on every filter change (the key), so the poll/banner
          state below never carries over from a different view/search —
          docs/ui/INBOX.md §6. */}
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
  );
}
