"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import type { ConversationPreview, InboxView } from "@/modules/conversations/service";
import { inboxUrl, type InboxFilters } from "@/app/(app)/inbox/inbox-filters";
import { fetchInboxList, inboxKeys, retryUnlessClientError, type InboxListData } from "@/app/(app)/inbox/inbox-queries";
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
import { cn } from "@/lib/cn";

const REFRESH_INTERVAL_MS = 5_000;
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

const NO_FILTERS: InboxFilters = { view: "all", search: "", channel: "", delegateId: "" };

function filtersKey(filters: InboxFilters): string {
  return `${filters.view}:${filters.search}:${filters.channel}:${filters.delegateId}`;
}

function sameOrder(a: ConversationPreview[], b: ConversationPreview[]): boolean {
  return a.length === b.length && a.every((conversation, index) => conversation.id === b[index].id);
}

/**
 * The Inbox list (UI-5, docs/ui/INBOX.md; data from the client cache since
 * 2026-09-29, docs/ui/CHAT.md §1): a "Mostrar"/channel/delegate/search
 * filter row + a dense, keyboard-navigable list. Each filter combination is
 * its own cached query, refreshed in the background every few seconds; a
 * filter change shows the previous results (dimmed) until the new ones
 * arrive instead of blanking the list.
 *
 * A background refresh that would reorder the rows under the reader is not
 * applied directly — a banner offers it instead (§6). Changing filters, or
 * a refresh that keeps the same order, applies at once.
 */
export function InboxList({
  filters,
  members,
  viewerId,
  isAdmin,
  availableChannels,
  openConversationId,
  onFiltersChange,
  onOpenConversation,
  onPrefetchConversation,
}: {
  filters: InboxFilters;
  members: { userId: string; name: string }[];
  viewerId: string;
  isAdmin: boolean;
  availableChannels: string[];
  /** The conversation open in the panel next to this list, if any (`InboxWorkspace` owns it). */
  openConversationId: string | null;
  onFiltersChange: (next: Partial<InboxFilters>, options?: { replace?: boolean }) => void;
  onOpenConversation: (conversationId: string) => void;
  onPrefetchConversation: (conversationId: string) => void;
}) {
  const { setOrder, focusListRef } = useInboxOrderPublisher();
  const listContainerRef = useRef<HTMLDivElement>(null);
  const searchDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const key = filtersKey(filters);

  const listQuery = useQuery({
    queryKey: inboxKeys.list(filters),
    queryFn: () => fetchInboxList(filters),
    refetchInterval: REFRESH_INTERVAL_MS,
    placeholderData: keepPreviousData,
    retry: retryUnlessClientError,
  });
  const data = listQuery.data;

  // What the reader sees, and a newer version held back behind the banner
  // (docs/ui/INBOX.md §6) — "adjusted during render" as data arrives, not in
  // an effect (`react-hooks/set-state-in-effect`).
  const [shown, setShown] = useState<{ key: string; data: InboxListData } | null>(data ? { key, data } : null);
  const [pendingUpdate, setPendingUpdate] = useState<InboxListData | null>(null);
  const [lastData, setLastData] = useState(data);
  const [seenKey, setSeenKey] = useState(key);
  if (key !== seenKey) {
    // A held-back update belongs to the previous filters, never to these.
    setSeenKey(key);
    setPendingUpdate(null);
  }
  if (data !== lastData) {
    setLastData(data);
    if (data) {
      const reordersUnderReader =
        shown !== null && shown.key === key && !listQuery.isPlaceholderData && !sameOrder(shown.data.conversations, data.conversations);
      if (reordersUnderReader) {
        setPendingUpdate(data);
      } else {
        setShown({ key, data });
        setPendingUpdate(null);
      }
    }
  }
  const conversations = useMemo(() => shown?.data.conversations ?? [], [shown]);
  const counts = data?.counts;
  const newCount = pendingUpdate
    ? pendingUpdate.conversations.filter((c) => !conversations.some((shownOne) => shownOne.id === c.id)).length
    : 0;

  // The search box is local while typing (debounced into the URL); the URL
  // still wins when it changes on its own (back/forward, "Quitar filtros").
  const [searchValue, setSearchValue] = useState(filters.search);
  const [seenSearch, setSeenSearch] = useState(filters.search);
  if (filters.search !== seenSearch) {
    setSeenSearch(filters.search);
    setSearchValue(filters.search);
  }

  const delegateNameById = useMemo(() => new Map(members.map((m) => [m.userId, m.name])), [members]);

  // Opening a conversation marks it read on the server, but this list only
  // learns that on its next refresh — until then the unread dot would linger
  // on a conversation the user has just read. Remember, per conversation,
  // the last message it had when opened here, and treat it as read up to
  // that point (a newer message still brings the dot back). Updated during
  // render: React's "adjust state when a prop changes" pattern.
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

  useEffect(() => () => {
    if (searchDebounceRef.current) clearTimeout(searchDebounceRef.current);
  }, []);

  function applyPendingUpdate() {
    if (!pendingUpdate) return;
    setShown({ key, data: pendingUpdate });
    setPendingUpdate(null);
  }

  function handleSearchChange(value: string) {
    setSearchValue(value);
    if (searchDebounceRef.current) {
      clearTimeout(searchDebounceRef.current);
    }
    searchDebounceRef.current = setTimeout(() => onFiltersChange({ search: value.trim() }, { replace: true }), SEARCH_DEBOUNCE_MS);
  }

  function clearFilters() {
    if (searchDebounceRef.current) clearTimeout(searchDebounceRef.current);
    setSearchValue("");
    onFiltersChange(NO_FILTERS);
  }

  const hasActiveFilters = Boolean(filters.view !== "all" || filters.search || filters.channel || filters.delegateId);
  // Previous filter's rows while this one loads — shown, but visibly not final.
  const refreshingForFilters = listQuery.isPlaceholderData || (shown !== null && shown.key !== key);

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
                  if (searchDebounceRef.current) clearTimeout(searchDebounceRef.current);
                  setSearchValue("");
                  onFiltersChange({ search: "" }, { replace: true });
                }}
              />
            }
            filters={
              <>
                <NativeSelect
                  aria-label="Mostrar"
                  value={filters.view}
                  onChange={(event) => onFiltersChange({ view: event.target.value as InboxView })}
                  className="w-auto"
                >
                  {VIEWS.map((view) => (
                    <option key={view} value={view}>
                      {VIEW_LABELS[view]}
                      {counts ? ` (${counts[view]})` : ""}
                    </option>
                  ))}
                </NativeSelect>
                <NativeSelect
                  aria-label="Canal"
                  value={filters.channel}
                  onChange={(event) => onFiltersChange({ channel: event.target.value })}
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
                    onChange={(event) => onFiltersChange({ delegateId: event.target.value })}
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
                <Button variant="ghost" size="sm" onClick={clearFilters}>
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
              {newCount > 0
                ? `${newCount} conversación${newCount === 1 ? "" : "es"} nueva${newCount === 1 ? "" : "s"}`
                : "Hay actualizaciones en la lista"}
            </Alert>
          )}

          <div aria-live="polite" className="sr-only">
            {pendingUpdate ? `${newCount} conversaciones nuevas` : ""}
          </div>

          {shown === null ? (
            listQuery.isError ? (
              <Alert
                tone="destructive"
                title="No se pudo cargar la lista"
                actions={
                  <Button size="sm" variant="outline" onClick={() => void listQuery.refetch()} loading={listQuery.isFetching}>
                    Reintentar
                  </Button>
                }
              >
                Comprueba la conexión e inténtalo de nuevo.
              </Alert>
            ) : (
              <InboxListSkeleton />
            )
          ) : conversations.length === 0 && !refreshingForFilters ? (
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
                  <Button size="sm" onClick={clearFilters}>
                    Quitar filtros
                  </Button>
                }
              />
            ) : (
              <EmptyState variant="inline" title="Todavía no hay conversaciones." />
            )
          ) : (
            <div
              ref={listContainerRef}
              aria-busy={refreshingForFilters || undefined}
              className={cn(
                "@container transition-opacity duration-(--duration-base) ease-standard",
                refreshingForFilters && "opacity-60",
              )}
            >
              {/* `@container`: the row's secondary bits (delegate name) hide
                  by the *list column's* own width, not the viewport — the
                  anchored conversation panel (docs/ui/CHAT.md §4) can make
                  this column much narrower than the browser window, which a
                  `sm:` viewport breakpoint would never notice. */}
              <DataList
                aria-label="Conversaciones"
                items={conversations.map((conversation) => ({
                  key: conversation.id,
                  href: inboxUrl(filters, conversation.id),
                  conversation,
                }))}
                isSelected={(item) => item.conversation.id === openConversationId}
                onItemActivate={(item) => onOpenConversation(item.key)}
                onItemIntent={(item) => onPrefetchConversation(item.key)}
                renderItem={(item) => {
                  const conversation = item.conversation;
                  // PKG-014: a DELEGATE can now see a Conversation that
                  // is not their own account (the reference delegate
                  // reading a colleague's thread with the same afiliado,
                  // or "acceso temporal" to a colleague's afiliado who
                  // just wrote to them) — the delegate name matters
                  // whenever the row isn't the viewer's own channel, not
                  // only for an ADMIN browsing everyone's.
                  const isOwnChannel = conversation.delegateId === viewerId;
                  const isTemporaryAccess =
                    !isAdmin && conversation.referenceDelegateId !== null && conversation.referenceDelegateId !== viewerId;
                  return (
                    <InboxRow
                      conversation={{ ...conversation, unread: isUnread(conversation) }}
                      delegateName={delegateNameById.get(conversation.delegateId)}
                      showDelegate={isAdmin || !isOwnChannel}
                      isTemporaryAccess={isTemporaryAccess}
                      referenceDelegateName={
                        isTemporaryAccess && conversation.referenceDelegateId
                          ? delegateNameById.get(conversation.referenceDelegateId)
                          : undefined
                      }
                    />
                  );
                }}
              />
            </div>
          )}
        </div>
      </PageContainer>
    </div>
  );
}

/** Skeleton shown while a filter combination loads for the first time (docs/ui/INBOX.md §6). */
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
