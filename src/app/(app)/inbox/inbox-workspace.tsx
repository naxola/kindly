"use client";

import { useCallback, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { InboxList } from "@/app/(app)/inbox/inbox-list";
import { ConversationPanel } from "@/app/(app)/inbox/[id]/conversation-panel";
import { saveFichaCollapsed } from "@/app/(app)/inbox/ficha-preference";
import { inboxUrl, parseConversationId, parseInboxFilters, type InboxFilters } from "@/app/(app)/inbox/inbox-filters";
import {
  HttpError,
  fetchConversationWorkspace,
  inboxKeys,
  retryUnlessClientError,
} from "@/app/(app)/inbox/inbox-queries";

// Longer than the panel's own close animation (`--duration-slow`, and the
// modal Sheet's shorter exit): the closed conversation stays rendered until
// it has fully slid away, then unmounts (which also stops its thread poll).
const UNMOUNT_AFTER_CLOSE_MS = 400;
// A conversation's panel data is reused as is for this long (a hover
// prefetch, reopening one just closed); older, it shows at once and is
// refreshed behind it.
const CONVERSATION_STALE_MS = 15_000;
// Marks a history entry pushed by opening a conversation from the list, so
// closing can step back to the list instead of stacking another entry.
const OPENED_FROM_LIST = "opened-from-list";

/** Read at call time from the address bar — the one up-to-date source inside a click handler. */
function currentFilters(): InboxFilters {
  return parseInboxFilters(new URLSearchParams(window.location.search));
}

/**
 * The Inbox: list + conversation panel, side by side (docs/ui/CHAT.md §1).
 *
 * All of its state is the URL's query string — `?view&search&channel&
 * delegateId` for the list, `?conversation=<id>` for the open conversation —
 * and changing any of it never goes back to the server for the page: it is
 * a History API update (Next's router integrates it with `useSearchParams`;
 * back/forward restore from the entry itself). Data comes from the
 * TanStack Query cache: the list per filter combination, refreshed in the
 * background, and each conversation's chat + ficha, prefetched on hover.
 * The server page only seeds that cache for the first paint.
 */
export function InboxWorkspace({
  members,
  availableChannels,
  viewerId,
  isAdmin,
  initialFichaCollapsed,
}: {
  members: { userId: string; name: string }[];
  availableChannels: string[];
  viewerId: string;
  isAdmin: boolean;
  initialFichaCollapsed: boolean;
}) {
  const queryClient = useQueryClient();
  const searchParams = useSearchParams();
  const filters = parseInboxFilters(searchParams);
  const urlConversationId = parseConversationId(searchParams);

  // The open conversation is local, urgent state set in the click handler
  // itself; Next applies a native `pushState` to `useSearchParams` inside a
  // (low-priority) transition, so waiting for the URL would add a beat
  // before the panel starts moving. The URL still wins whenever it changes
  // on its own — back/forward — "adjusted during render", not in an effect.
  const [openId, setOpenId] = useState(urlConversationId);
  const [seenUrlConversationId, setSeenUrlConversationId] = useState(urlConversationId);
  if (urlConversationId !== seenUrlConversationId) {
    setSeenUrlConversationId(urlConversationId);
    setOpenId(urlConversationId);
  }

  // Keeps showing the conversation that was open while the panel animates
  // closed.
  const [shownId, setShownId] = useState(openId);
  if (openId && openId !== shownId) {
    setShownId(openId);
  }
  useEffect(() => {
    if (openId) return;
    const timer = setTimeout(() => setShownId(null), UNMOUNT_AFTER_CLOSE_MS);
    return () => clearTimeout(timer);
  }, [openId]);

  const conversationQuery = useQuery({
    queryKey: inboxKeys.conversation(shownId ?? ""),
    queryFn: () => fetchConversationWorkspace(shownId!),
    enabled: shownId !== null,
    staleTime: CONVERSATION_STALE_MS,
    retry: retryUnlessClientError,
  });

  const prefetchConversation = useCallback(
    (conversationId: string) => {
      void queryClient.prefetchQuery({
        queryKey: inboxKeys.conversation(conversationId),
        queryFn: () => fetchConversationWorkspace(conversationId),
        staleTime: CONVERSATION_STALE_MS,
        retry: retryUnlessClientError,
      });
    },
    [queryClient],
  );

  const openConversation = useCallback((conversationId: string) => {
    setOpenId(conversationId);
    const url = inboxUrl(currentFilters(), conversationId);
    if (parseConversationId(new URLSearchParams(window.location.search))) {
      // Switching conversation keeps the entry's own marker, so closing
      // still returns to the list in one step.
      window.history.replaceState({ inboxPanel: window.history.state?.inboxPanel }, "", url);
    } else {
      window.history.pushState({ inboxPanel: OPENED_FROM_LIST }, "", url);
    }
  }, []);

  const closeConversation = useCallback(() => {
    setOpenId(null);
    if (window.history.state?.inboxPanel === OPENED_FROM_LIST) {
      window.history.back();
    } else {
      window.history.pushState(null, "", inboxUrl(currentFilters(), null));
    }
  }, []);

  // Filters are URL state too — no navigation, so the list swaps to that
  // filter's cached data (or fetches it) without the page going anywhere.
  // Typing in the search box replaces the entry instead of stacking one
  // per keystroke.
  const changeFilters = useCallback((next: Partial<InboxFilters>, { replace = false }: { replace?: boolean } = {}) => {
    const params = new URLSearchParams(window.location.search);
    const url = inboxUrl({ ...parseInboxFilters(params), ...next }, parseConversationId(params));
    if (replace) {
      window.history.replaceState({ inboxPanel: window.history.state?.inboxPanel }, "", url);
    } else {
      window.history.pushState(null, "", url);
    }
  }, []);

  const [fichaCollapsed, setFichaCollapsed] = useState(initialFichaCollapsed);
  const toggleFicha = useCallback(() => {
    const next = !fichaCollapsed;
    setFichaCollapsed(next);
    saveFichaCollapsed(next);
  }, [fichaCollapsed]);

  const onMutated = useCallback(() => {
    if (shownId) void queryClient.invalidateQueries({ queryKey: inboxKeys.conversation(shownId) });
    void queryClient.invalidateQueries({ queryKey: inboxKeys.lists() });
  }, [queryClient, shownId]);

  const error = conversationQuery.error;
  const notFound = error instanceof HttpError && (error.status === 404 || error.status === 403);

  return (
    <div className="flex h-full min-w-0 flex-1">
      {/* Never remounted on a filter change — that would drop the search
          box's focus mid-typing; the list resets its own "new
          conversations" banner per filter combination instead. */}
      <InboxList
        filters={filters}
        members={members}
        viewerId={viewerId}
        isAdmin={isAdmin}
        availableChannels={availableChannels}
        openConversationId={openId}
        onFiltersChange={changeFilters}
        onOpenConversation={openConversation}
        onPrefetchConversation={prefetchConversation}
      />
      <ConversationPanel
        open={openId !== null}
        conversationId={shownId}
        data={conversationQuery.data}
        notFound={notFound}
        loadFailed={conversationQuery.isError && !notFound && !conversationQuery.data}
        retrying={conversationQuery.isFetching}
        onRetry={() => void conversationQuery.refetch()}
        fichaCollapsed={fichaCollapsed}
        onToggleFicha={toggleFicha}
        onClose={closeConversation}
        onOpenConversation={openConversation}
        onMutated={onMutated}
      />
    </div>
  );
}
