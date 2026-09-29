import type { Metadata } from "next";
import { requireCurrentOrganizationMember } from "@/modules/organizations/service";
import { getInboxListData, type InboxSearchParams } from "@/app/(app)/inbox/inbox-data";
import { getFichaCollapsed } from "@/app/(app)/inbox/ficha-cookie";
import { InboxWorkspace } from "@/app/(app)/inbox/inbox-workspace";
import { pageTitle } from "@/lib/page-title";

export async function generateMetadata(): Promise<Metadata> {
  const member = await requireCurrentOrganizationMember();
  return { title: pageTitle("Conversaciones", member.organizationName) };
}

export default async function InboxPage({ searchParams }: { searchParams: Promise<InboxSearchParams> }) {
  const params = await searchParams;
  const member = await requireCurrentOrganizationMember();
  const [{ filters, conversations, counts, members, availableChannels }, fichaCollapsed] = await Promise.all([
    getInboxListData(member, params),
    getFichaCollapsed(),
  ]);

  return (
    <InboxWorkspace
      filters={filters}
      initialConversations={conversations}
      initialCounts={counts}
      members={members.map((m) => ({ userId: m.userId, name: m.name }))}
      viewerId={member.userId}
      isAdmin={member.role === "ADMIN"}
      availableChannels={availableChannels}
      initialConversation={null}
      initialFichaCollapsed={fichaCollapsed}
    />
  );
}
