import "server-only";
import { listOrganizationMembers, type CurrentOrganizationMember } from "@/modules/organizations/service";
import {
  countConversationsByView,
  listConversationChannels,
  listConversationsWithPreview,
  type InboxView,
} from "@/modules/conversations/service";

const VALID_VIEWS: InboxView[] = ["pending", "unread", "unassigned", "all"];

function parseView(value: string | undefined): InboxView {
  return VALID_VIEWS.includes(value as InboxView) ? (value as InboxView) : "pending";
}

export interface InboxSearchParams {
  view?: string;
  search?: string;
  channel?: string;
  delegateId?: string;
}

export interface InboxFilters {
  view: InboxView;
  search: string;
  channel: string;
  delegateId: string;
}

/**
 * The list's filters + data, fetched identically whether the route
 * matched is the bare list (`page.tsx`) or a conversation opened by a
 * direct link/refresh (`[id]/page.tsx` renders the list itself in that
 * case — docs/ui/CHAT.md §1, intercepting routes don't apply on hard
 * navigation, so there is no other slot supplying it).
 */
export async function getInboxListData(member: CurrentOrganizationMember, params: InboxSearchParams) {
  const filters: InboxFilters = {
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

  return { filters, conversations, counts, members, availableChannels };
}
