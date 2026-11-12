import type { ConversationPreview, InboxViewCounts } from "@/modules/conversations/service";
import type { ConversationWorkspaceData } from "@/app/(app)/inbox/conversation-workspace-types";
import { inboxApiQuery, type InboxFilters } from "@/app/(app)/inbox/inbox-filters";

/**
 * TanStack Query keys and fetchers for the Inbox (docs/ui/CHAT.md §1). The
 * server page seeds the same keys (hydration) so the first paint needs no
 * client fetch; after that the list refreshes itself in the background and
 * every conversation is fetched once, cached, and reused.
 */
export interface InboxListData {
  conversations: ConversationPreview[];
  counts: InboxViewCounts;
}

export const inboxKeys = {
  all: ["inbox"] as const,
  lists: () => ["inbox", "list"] as const,
  list: (filters: InboxFilters) =>
    ["inbox", "list", filters.view, filters.search, filters.channel, filters.delegateId] as const,
  conversation: (conversationId: string) => ["inbox", "conversation", conversationId] as const,
};

/** A non-2xx response, kept apart from a network failure so a 404 isn't retried. */
export class HttpError extends Error {
  constructor(readonly status: number) {
    super(`HTTP ${status}`);
  }
}

async function getJson<T>(url: string): Promise<T> {
  const response = await fetch(url, { cache: "no-store" });
  if (!response.ok) {
    throw new HttpError(response.status);
  }
  return (await response.json()) as T;
}

export function fetchInboxList(filters: InboxFilters): Promise<InboxListData> {
  return getJson(`/api/inbox?${inboxApiQuery(filters)}`);
}

export function fetchConversationWorkspace(conversationId: string): Promise<ConversationWorkspaceData> {
  return getJson(`/api/conversations/${conversationId}/workspace`);
}

/** Retry a network/5xx failure once more; never a 4xx (it won't change). */
export function retryUnlessClientError(failureCount: number, error: unknown): boolean {
  if (error instanceof HttpError && error.status < 500) return false;
  return failureCount < 2;
}
