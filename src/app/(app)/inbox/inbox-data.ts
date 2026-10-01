import "server-only";
import { listOrganizationMembers, type CurrentOrganizationMember } from "@/modules/organizations/service";
import {
  countConversationsByView,
  listConversationChannels,
  listConversationsWithPreview,
} from "@/modules/conversations/service";
import type { InboxFilters } from "@/app/(app)/inbox/inbox-filters";
import type { InboxListData } from "@/app/(app)/inbox/inbox-queries";

/**
 * The list for one set of filters — exactly what `GET /api/inbox` returns,
 * so the server page can seed the client cache with it (docs/ui/CHAT.md §1).
 * JSON round-tripped on purpose: the client only ever sees this shape as
 * JSON (dates as strings), whether it came from here or from the API.
 */
export async function getInboxList(member: CurrentOrganizationMember, filters: InboxFilters): Promise<InboxListData> {
  const [conversations, counts] = await Promise.all([
    listConversationsWithPreview(member.organizationId, member, {
      view: filters.view,
      search: filters.search || undefined,
      channel: filters.channel || undefined,
      delegateId: filters.delegateId || undefined,
    }),
    countConversationsByView(member.organizationId, member, {
      channel: filters.channel || undefined,
      delegateId: filters.delegateId || undefined,
    }),
  ]);
  return JSON.parse(JSON.stringify({ conversations, counts })) as InboxListData;
}

/** What the Inbox needs that doesn't depend on the filters. */
export async function getInboxStaticData(member: CurrentOrganizationMember) {
  const [members, availableChannels] = await Promise.all([
    listOrganizationMembers(member.organizationId),
    listConversationChannels(member.organizationId),
  ]);
  return { members: members.map((m) => ({ userId: m.userId, name: m.name })), availableChannels };
}
