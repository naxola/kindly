"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import type { ConversationPreview, InboxViewCounts } from "@/modules/conversations/service";
import type { InboxFilters } from "@/app/(app)/inbox/inbox-data";
import type { ConversationWorkspaceData } from "@/app/(app)/inbox/conversation-workspace-types";
import { InboxList } from "@/app/(app)/inbox/inbox-list";
import { ConversationPanel } from "@/app/(app)/inbox/[id]/conversation-panel";
import { saveFichaCollapsed } from "@/app/(app)/inbox/ficha-preference";

/** A conversation open in the panel is always `/inbox/<id>` exactly. */
function openIdFrom(pathname: string): string | null {
  return /^\/inbox\/([^/]+)$/.exec(pathname)?.[1] ?? null;
}

// Longer than the panel's own close animation (`--duration-slow`, and the
// modal Sheet's shorter exit): the closed conversation stays rendered until
// it has fully slid away, then unmounts (which also stops its thread poll).
const UNMOUNT_AFTER_CLOSE_MS = 400;
// A prefetched (hovered) conversation opened within this long is shown as
// is; older data is shown at once and refreshed behind it.
const FRESH_MS = 15_000;
// Marks a history entry this component pushed for opening from the list,
// so closing can step back to the list instead of stacking another entry.
const OPENED_FROM_LIST = "opened-from-list";

/**
 * The Inbox: list + conversation panel, side by side (docs/ui/CHAT.md §1).
 *
 * Opening, switching and closing a conversation never navigate: they update
 * the URL with the native History API (which Next's router integrates with
 * `usePathname`, and whose back/forward it restores from the entry itself)
 * and the always-mounted panel animates to its new state at once. The
 * panel's data comes from `/api/conversations/<id>/workspace` — prefetched
 * when a row is hovered or focused, cached per conversation — so a click
 * almost always opens with its content already there, and never waits on
 * the server to start moving. The list is never reloaded by any of this.
 *
 * `/inbox/<id>` still works as a real URL: a direct load or refresh is
 * `[id]/page.tsx`, which renders this same component with that
 * conversation's data already resolved (`initialConversation`).
 */
export function InboxWorkspace({
  filters,
  initialConversations,
  initialCounts,
  members,
  viewerId,
  isAdmin,
  availableChannels,
  initialConversation,
  initialFichaCollapsed,
}: {
  filters: InboxFilters;
  initialConversations: ConversationPreview[];
  initialCounts: InboxViewCounts;
  members: { userId: string; name: string }[];
  viewerId: string;
  isAdmin: boolean;
  availableChannels: string[];
  initialConversation: ConversationWorkspaceData | null;
  initialFichaCollapsed: boolean;
}) {
  // The open conversation is local, urgent state set in the click handler
  // itself; Next applies a native `pushState` to `usePathname` inside a
  // (low-priority) transition, so waiting for the URL would add a beat
  // before the panel starts moving. The URL still wins whenever it changes
  // on its own — back/forward — "adjusted during render", not in an effect.
  const pathname = usePathname();
  const pathnameOpenId = openIdFrom(pathname);
  const [openId, setOpenId] = useState(pathnameOpenId);
  const [seenPathnameOpenId, setSeenPathnameOpenId] = useState(pathnameOpenId);
  if (pathnameOpenId !== seenPathnameOpenId) {
    setSeenPathnameOpenId(pathnameOpenId);
    setOpenId(pathnameOpenId);
  }

  const [cache, setCache] = useState<Record<string, ConversationWorkspaceData>>(() =>
    initialConversation ? { [initialConversation.conversationId]: initialConversation } : {},
  );
  const [notFound, setNotFound] = useState<Record<string, true>>({});
  const inFlightRef = useRef(new Set<string>());
  const fetchedAtRef = useRef(new Map<string, number>());
  const [fichaCollapsed, setFichaCollapsed] = useState(initialFichaCollapsed);

  // Keeps showing the conversation that was open while the panel animates
  // closed — "adjust state during render", not an effect
  // (`react-hooks/set-state-in-effect`).
  const [shownId, setShownId] = useState(openId);
  if (openId && openId !== shownId) {
    setShownId(openId);
  }
  useEffect(() => {
    if (openId) return;
    const timer = setTimeout(() => setShownId(null), UNMOUNT_AFTER_CLOSE_MS);
    return () => clearTimeout(timer);
  }, [openId]);

  useEffect(() => {
    if (initialConversation) {
      fetchedAtRef.current.set(initialConversation.conversationId, Date.now());
    }
    // Only the server-resolved conversation this instance started with.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const load = useCallback((conversationId: string, { force = false }: { force?: boolean } = {}) => {
    if (inFlightRef.current.has(conversationId)) return;
    const fetchedAt = fetchedAtRef.current.get(conversationId);
    if (!force && fetchedAt && Date.now() - fetchedAt < FRESH_MS) return;
    inFlightRef.current.add(conversationId);
    fetch(`/api/conversations/${conversationId}/workspace`, { cache: "no-store" })
      .then(async (response) => {
        if (response.status === 404) {
          setNotFound((current) => ({ ...current, [conversationId]: true }));
          return;
        }
        if (!response.ok) return;
        const data = (await response.json()) as ConversationWorkspaceData;
        fetchedAtRef.current.set(conversationId, Date.now());
        setCache((current) => ({ ...current, [conversationId]: data }));
      })
      .catch(() => {})
      .finally(() => inFlightRef.current.delete(conversationId));
  }, []);

  // Whatever opened it (a click, Alt+↓, the browser's back/forward), make
  // sure the open conversation's data is there and not stale.
  useEffect(() => {
    if (openId) load(openId);
  }, [openId, load]);

  const openConversation = useCallback(
    (conversationId: string) => {
      setOpenId(conversationId);
      load(conversationId);
      const url = `/inbox/${conversationId}${window.location.search}`;
      if (openIdFrom(window.location.pathname)) {
        // Switching conversation keeps the entry's own marker, so closing
        // still returns to the list in one step.
        window.history.replaceState({ inboxPanel: window.history.state?.inboxPanel }, "", url);
      } else {
        window.history.pushState({ inboxPanel: OPENED_FROM_LIST }, "", url);
      }
    },
    [load],
  );

  const closeConversation = useCallback(() => {
    setOpenId(null);
    if (window.history.state?.inboxPanel === OPENED_FROM_LIST) {
      window.history.back();
    } else {
      window.history.pushState(null, "", `/inbox${window.location.search}`);
    }
  }, []);

  const toggleFicha = useCallback(() => {
    const next = !fichaCollapsed;
    setFichaCollapsed(next);
    saveFichaCollapsed(next);
  }, [fichaCollapsed]);

  return (
    <div className="flex h-full min-w-0 flex-1">
      {/* Remounts on every filter change (the key), so the poll/banner
          state never carries over from a different view/search —
          docs/ui/INBOX.md §6. */}
      <InboxList
        key={`${filters.view}:${filters.search}:${filters.channel}:${filters.delegateId}`}
        filters={filters}
        initialConversations={initialConversations}
        initialCounts={initialCounts}
        members={members}
        viewerId={viewerId}
        isAdmin={isAdmin}
        availableChannels={availableChannels}
        openConversationId={openId}
        onOpenConversation={openConversation}
        onPrefetchConversation={load}
      />
      <ConversationPanel
        open={openId !== null}
        conversationId={shownId}
        data={shownId ? cache[shownId] : undefined}
        notFound={shownId ? Boolean(notFound[shownId]) : false}
        fichaCollapsed={fichaCollapsed}
        onToggleFicha={toggleFicha}
        onClose={closeConversation}
        onOpenConversation={openConversation}
        onMutated={() => shownId && load(shownId, { force: true })}
      />
    </div>
  );
}
