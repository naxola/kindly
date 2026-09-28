"use client";

import { useCallback, useEffect, useMemo, useRef, useState, useTransition } from "react";
import { usePathname, useRouter } from "next/navigation";
import type { ConversationPreview, InboxView, InboxViewCounts } from "@/modules/conversations/service";
import type { InboxFilters } from "@/app/(app)/inbox/inbox-data";
import { buildHref } from "@/app/(app)/inbox/inbox-href";
import { PageContainer } from "@/components/patterns/page-container";
import { PageHeader } from "@/components/patterns/page-header";
import { DataList } from "@/components/ui/data-list";
import { FilterBar } from "@/components/ui/filter-bar";
import { SearchInput } from "@/components/ui/search-input";
import { NativeSelect } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Alert } from "@/components/ui/alert";
import { EmptyState } from "@/components/ui/empty-state";
import { Skeleton } from "@/components/ui/primitives";
import { InboxRow } from "@/app/(app)/inbox/inbox-row";
import { useInboxOrderPublisher } from "@/app/(app)/inbox/inbox-order-context";

const POLL_INTERVAL_MS = 5_000;
const SEARCH_DEBOUNCE_MS = 300;

const CONVERSATIONS_TITLE = "Conversaciones";
const CONVERSATIONS_DESCRIPTION = "Todas las conversaciones de tus canales conectados, la más reciente primero";

const VIEWS: InboxView[] = ["all", "unread", "pending", "unassigned"];
const VIEW_LABELS: Record<InboxView, string> = {
  all: "Todas",
  unread: "No leídas",
  pending: "Pendientes de respuesta",
  unassigned: "Sin identificar",
};

/**
 * The Inbox list (UI-5, docs/ui/INBOX.md): views + search/filters (all in
 * the URL) + a dense, keyboard-navigable list that polls for updates
 * without reordering under the reader (§6 — a banner offers the update
 * instead of applying it under the cursor).
 *
 * One list of every conversation, newest activity first, the way a
 * WhatsApp chat list reads (2026-09-28, docs/ui/INBOX.md §2): the views are
 * a "Mostrar" dropdown in the filter row, not a side menu — they are
 * filters over that one list, not separate places to navigate to.
 */
export function InboxList({
  filters,
  initialConversations,
  initialCounts,
  members,
  isAdmin,
  availableChannels,
}: {
  filters: InboxFilters;
  initialConversations: ConversationPreview[];
  initialCounts: InboxViewCounts;
  members: { userId: string; name: string }[];
  isAdmin: boolean;
  availableChannels: string[];
}) {
  const router = useRouter();
  const pathname = usePathname();
  const [, startTransition] = useTransition();
  const { setOrder, focusListRef } = useInboxOrderPublisher();

  const [conversations, setConversations] = useState(initialConversations);
  const [counts, setCounts] = useState(initialCounts);
  const [pendingUpdate, setPendingUpdate] = useState<{ conversations: ConversationPreview[]; newCount: number } | null>(
    null,
  );
  const [searchValue, setSearchValue] = useState(filters.search);
  const currentIdsRef = useRef(initialConversations.map((c) => c.id));
  const searchDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const listContainerRef = useRef<HTMLDivElement>(null);

  const delegateNameById = useMemo(() => new Map(members.map((m) => [m.userId, m.name])), [members]);

  // A conversation open in the panel is always `/inbox/<id>` exactly —
  // never one of this route's own subpaths — so this can't misfire.
  const openConversationId = /^\/inbox\/([^/]+)$/.exec(pathname)?.[1] ?? null;

  // Opening a conversation marks it read on the server, but this list only
  // learns that on its next poll — until then the unread dot would linger
  // on a conversation the user has just read. Remember, per conversation,
  // the last message it had when opened here, and treat it as read up to
  // that point (a newer message still brings the dot back). Updated during
  // render, not in an effect: React's "adjust state when a prop changes"
  // pattern, which `react-hooks/set-state-in-effect` requires.
  const [readUpTo, setReadUpTo] = useState<Record<string, string>>({});
  const openLastMessageAt = conversations.find((c) => c.id === openConversationId)?.lastMessage?.createdAt;
  const openLastMessageIso = openLastMessageAt ? new Date(openLastMessageAt).toISOString() : null;
  if (openConversationId && openLastMessageIso && readUpTo[openConversationId] !== openLastMessageIso) {
    setReadUpTo((previous) => ({ ...previous, [openConversationId]: openLastMessageIso }));
  }
  function isUnread(conversation: ConversationPreview): boolean {
    if (!conversation.unread || conversation.id === openConversationId) return false;
    const seen = readUpTo[conversation.id];
    return !(seen && conversation.lastMessage && new Date(conversation.lastMessage.createdAt) <= new Date(seen));
  }

  useEffect(() => {
    setOrder(conversations.map((c) => c.id));
  }, [conversations, setOrder]);

  useEffect(() => {
    focusListRef.current = () => {
      listContainerRef.current?.querySelector<HTMLElement>('[tabindex="0"]')?.focus();
    };
    return () => {
      focusListRef.current = null;
    };
  }, [focusListRef]);

  const navigate = useCallback(
    (next: Partial<InboxFilters>) => {
      startTransition(() => {
        router.push(buildHref(pathname, { ...filters, ...next }));
      });
    },
    [filters, pathname, router, startTransition],
  );

  const poll = useCallback(async () => {
    const params = new URLSearchParams();
    params.set("view", filters.view);
    if (filters.search) params.set("search", filters.search);
    if (filters.channel) params.set("channel", filters.channel);
    if (filters.delegateId) params.set("delegateId", filters.delegateId);

    const response = await fetch(`/api/inbox?${params.toString()}`, { cache: "no-store" }).catch(() => null);
    if (!response?.ok) {
      return;
    }
    const data = (await response.json()) as { conversations: ConversationPreview[]; counts: InboxViewCounts };
    setCounts(data.counts);

    const freshIds = data.conversations.map((c) => c.id);
    const sameOrder =
      freshIds.length === currentIdsRef.current.length && freshIds.every((id, index) => id === currentIdsRef.current[index]);
    if (sameOrder) {
      // Same conversations, same order — updating previews/unread flags in
      // place cannot move anything under the reader's cursor.
      setConversations(data.conversations);
      return;
    }
    const newCount = freshIds.filter((id) => !currentIdsRef.current.includes(id)).length;
    setPendingUpdate({ conversations: data.conversations, newCount });
  }, [filters.view, filters.search, filters.channel, filters.delegateId]);

  useEffect(() => {
    const timer = setInterval(() => {
      if (document.visibilityState === "visible") {
        void poll();
      }
    }, POLL_INTERVAL_MS);
    const onVisible = () => document.visibilityState === "visible" && void poll();
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      clearInterval(timer);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [poll]);

  function applyPendingUpdate() {
    if (!pendingUpdate) {
      return;
    }
    currentIdsRef.current = pendingUpdate.conversations.map((c) => c.id);
    setConversations(pendingUpdate.conversations);
    setPendingUpdate(null);
  }

  function handleSearchChange(value: string) {
    setSearchValue(value);
    if (searchDebounceRef.current) {
      clearTimeout(searchDebounceRef.current);
    }
    searchDebounceRef.current = setTimeout(() => navigate({ search: value }), SEARCH_DEBOUNCE_MS);
  }

  const hasActiveFilters = Boolean(filters.view !== "all" || filters.search || filters.channel || filters.delegateId);

  return (
    <div className="h-full min-w-0 flex-1 overflow-y-auto">
      <PageContainer size="full">
        <PageHeader title={CONVERSATIONS_TITLE} description={CONVERSATIONS_DESCRIPTION} />

        <div className="flex min-w-0 flex-col gap-3">
          <FilterBar
            search={
              <SearchInput
                aria-label="Buscar"
                placeholder="Buscar nombre, teléfono o mensaje"
                value={searchValue}
                onChange={(event) => handleSearchChange(event.target.value)}
                onClear={() => {
                  setSearchValue("");
                  navigate({ search: "" });
                }}
              />
            }
            filters={
              <>
                <NativeSelect
                  aria-label="Mostrar"
                  value={filters.view}
                  onChange={(event) => navigate({ view: event.target.value as InboxView })}
                  className="w-auto"
                >
                  {VIEWS.map((view) => (
                    <option key={view} value={view}>
                      {VIEW_LABELS[view]} ({counts[view]})
                    </option>
                  ))}
                </NativeSelect>
                <NativeSelect
                  aria-label="Canal"
                  value={filters.channel}
                  onChange={(event) => navigate({ channel: event.target.value })}
                  className="w-auto"
                >
                  <option value="">Todos los canales</option>
                  {availableChannels.map((channel) => (
                    <option key={channel} value={channel}>
                      {channel}
                    </option>
                  ))}
                </NativeSelect>
                {isAdmin && (
                  <NativeSelect
                    aria-label="Delegado"
                    value={filters.delegateId}
                    onChange={(event) => navigate({ delegateId: event.target.value })}
                    className="w-auto"
                  >
                    <option value="">Todos los delegados</option>
                    {members.map((m) => (
                      <option key={m.userId} value={m.userId}>
                        {m.name}
                      </option>
                    ))}
                  </NativeSelect>
                )}
              </>
            }
            actions={
              hasActiveFilters && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    setSearchValue("");
                    navigate({ view: "all", search: "", channel: "", delegateId: "" });
                  }}
                >
                  Quitar filtros
                </Button>
              )
            }
          />

          {pendingUpdate && (
            <Alert
              tone="info"
              actions={
                <Button size="sm" variant="primary" onClick={applyPendingUpdate}>
                  Ver
                </Button>
              }
            >
              {pendingUpdate.newCount > 0
                ? `${pendingUpdate.newCount} conversación${pendingUpdate.newCount === 1 ? "" : "es"} nueva${pendingUpdate.newCount === 1 ? "" : "s"}`
                : "Hay actualizaciones en la lista"}
            </Alert>
          )}

          <div aria-live="polite" className="sr-only">
            {pendingUpdate ? `${pendingUpdate.newCount} conversaciones nuevas` : ""}
          </div>

          {conversations.length === 0 ? (
            hasActiveFilters ? (
              <EmptyState
                variant="inline"
                title={
                  filters.search
                    ? `Ninguna conversación coincide con «${filters.search}»`
                    : "Ninguna conversación coincide con los filtros"
                }
                description="Prueba con otro nombre o quita los filtros."
                action={
                  <Button
                    size="sm"
                    onClick={() => {
                      setSearchValue("");
                      navigate({ view: "all", search: "", channel: "", delegateId: "" });
                    }}
                  >
                    Quitar filtros
                  </Button>
                }
              />
            ) : (
              <EmptyState variant="inline" title="Todavía no hay conversaciones." />
            )
          ) : (
            <div ref={listContainerRef} className="@container">
              {/* `@container`: the row's secondary bits (delegate name) hide
                  by the *list column's* own width, not the viewport — the
                  anchored conversation panel (docs/ui/CHAT.md §4) can make
                  this column much narrower than the browser window, which a
                  `sm:` viewport breakpoint would never notice. */}
              <DataList
                aria-label="Conversaciones"
                items={conversations.map((conversation) => ({ key: conversation.id, href: `/inbox/${conversation.id}`, conversation }))}
                isSelected={(item) => item.conversation.id === openConversationId}
                renderItem={(item) => (
                  <InboxRow
                    conversation={{ ...item.conversation, unread: isUnread(item.conversation) }}
                    delegateName={delegateNameById.get(item.conversation.delegateId)}
                    showDelegate={isAdmin}
                  />
                )}
              />
            </div>
          )}
        </div>
      </PageContainer>
    </div>
  );
}

/** Skeleton shown while the server fetches the first page (docs/ui/INBOX.md §6). */
export function InboxListSkeleton() {
  return (
    <div aria-busy className="flex flex-col gap-3 px-3 py-2.5">
      <span className="sr-only">Cargando conversaciones</span>
      {[0, 1, 2, 3, 4].map((row) => (
        <div key={row} className="flex items-center gap-3">
          <Skeleton className="size-8 shrink-0 rounded-full" />
          <div className="flex flex-1 flex-col gap-1.5">
            <Skeleton className="h-3.5 w-1/3" />
            <Skeleton className="h-3 w-2/3" />
          </div>
        </div>
      ))}
    </div>
  );
}
