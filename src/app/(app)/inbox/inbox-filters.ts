import type { InboxView } from "@/modules/conversations/service";

/**
 * The Inbox's whole UI state lives in the URL's query string (docs/ui/CHAT.md
 * §1): the list filters and the open conversation. A plain module (neither
 * "use client" nor "use server") so the server page, the API route and the
 * client all parse and build it the same way.
 */
export interface InboxFilters {
  view: InboxView;
  search: string;
  channel: string;
  delegateId: string;
}

export const CONVERSATION_PARAM = "conversation";

const VALID_VIEWS: InboxView[] = ["pending", "unread", "unassigned", "all"];

interface ParamReader {
  get(name: string): string | null;
}

export function parseInboxFilters(params: ParamReader): InboxFilters {
  const view = params.get("view");
  return {
    view: VALID_VIEWS.includes(view as InboxView) ? (view as InboxView) : "all",
    search: params.get("search")?.trim() ?? "",
    channel: params.get("channel")?.trim() ?? "",
    delegateId: params.get("delegateId")?.trim() ?? "",
  };
}

export function parseConversationId(params: ParamReader): string | null {
  return params.get(CONVERSATION_PARAM) || null;
}

/** `/inbox` plus only the non-default filters and, if any, the open conversation. */
export function inboxUrl(filters: InboxFilters, conversationId: string | null): string {
  const params = new URLSearchParams();
  if (filters.view !== "all") params.set("view", filters.view);
  if (filters.search) params.set("search", filters.search);
  if (filters.channel) params.set("channel", filters.channel);
  if (filters.delegateId) params.set("delegateId", filters.delegateId);
  if (conversationId) params.set(CONVERSATION_PARAM, conversationId);
  const query = params.toString();
  return query ? `/inbox?${query}` : "/inbox";
}

/** Same filters as `/api/inbox` reads them, for the list's own fetch. */
export function inboxApiQuery(filters: InboxFilters): string {
  const params = new URLSearchParams({ view: filters.view });
  if (filters.search) params.set("search", filters.search);
  if (filters.channel) params.set("channel", filters.channel);
  if (filters.delegateId) params.set("delegateId", filters.delegateId);
  return params.toString();
}
