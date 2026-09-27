"use client";

import { useCallback, useEffect, useMemo, useRef, useState, useTransition } from "react";
import { usePathname, useRouter } from "next/navigation";
import type { ConversationPreview, InboxView, InboxViewCounts } from "@/modules/conversations/service";
import { ContextNav, type ContextNavItem } from "@/components/shell/context-nav";
import { DataList } from "@/components/ui/data-list";
import { FilterBar } from "@/components/ui/filter-bar";
import { SearchInput } from "@/components/ui/search-input";
import { NativeSelect } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Alert } from "@/components/ui/alert";
import { EmptyState } from "@/components/ui/empty-state";
import { Skeleton } from "@/components/ui/primitives";
import { InboxRow } from "@/app/(app)/inbox/inbox-row";

const POLL_INTERVAL_MS = 5_000;
const SEARCH_DEBOUNCE_MS = 300;

const VIEWS: InboxView[] = ["pending", "unread", "unassigned", "all"];
const VIEW_LABELS: Record<InboxView, string> = {
  pending: "Pendientes",
  unread: "No leídas",
  unassigned: "Sin identificar",
  all: "Todas",
};

interface InboxFilters {
  view: InboxView;
  search: string;
  channel: string;
  delegateId: string;
}

function buildHref(pathname: string, filters: InboxFilters): string {
  const params = new URLSearchParams();
  if (filters.view !== "pending") params.set("view", filters.view);
  if (filters.search) params.set("search", filters.search);
  if (filters.channel) params.set("channel", filters.channel);
  if (filters.delegateId) params.set("delegateId", filters.delegateId);
  const query = params.toString();
  return query ? `${pathname}?${query}` : pathname;
}

/**
 * The Inbox list (UI-5, docs/ui/INBOX.md): views + search/filters (all in
 * the URL) + a dense, keyboard-navigable list that polls for updates
 * without reordering under the reader (§6 — a banner offers the update
 * instead of applying it under the cursor).
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

  const [conversations, setConversations] = useState(initialConversations);
  const [counts, setCounts] = useState(initialCounts);
  const [pendingUpdate, setPendingUpdate] = useState<{ conversations: ConversationPreview[]; newCount: number } | null>(
    null,
  );
  const [searchValue, setSearchValue] = useState(filters.search);
  const currentIdsRef = useRef(initialConversations.map((c) => c.id));
  const searchDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const delegateNameById = useMemo(() => new Map(members.map((m) => [m.userId, m.name])), [members]);

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

  const hasActiveFilters = Boolean(filters.search || filters.channel || filters.delegateId);
  const contextItems: ContextNavItem[] = VIEWS.map((view) => ({
    href: buildHref(pathname, { ...filters, view }),
    label: VIEW_LABELS[view],
    count: counts[view],
  }));

  return (
    <div className="flex flex-1 flex-col gap-4 lg:flex-row lg:gap-6">
      <ContextNav label="Bandeja" items={contextItems} />

      <div className="flex min-w-0 flex-1 flex-col gap-3">
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
                  navigate({ search: "", channel: "", delegateId: "" });
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
              title={`Ninguna conversación coincide con «${filters.search}»`}
              description="Prueba con otro nombre o quita los filtros."
              action={
                <Button size="sm" onClick={() => navigate({ search: "", channel: "", delegateId: "" })}>
                  Quitar filtros
                </Button>
              }
            />
          ) : (
            <EmptyState variant="inline" title="Todavía no hay conversaciones." />
          )
        ) : (
          <DataList
            aria-label="Conversaciones"
            items={conversations.map((conversation) => ({ key: conversation.id, href: `/inbox/${conversation.id}`, conversation }))}
            renderItem={(item) => (
              <InboxRow
                conversation={item.conversation}
                delegateName={delegateNameById.get(item.conversation.delegateId)}
                showDelegate={isAdmin}
              />
            )}
          />
        )}
      </div>
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
