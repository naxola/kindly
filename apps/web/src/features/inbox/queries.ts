'use client'

import { useQuery } from '@tanstack/react-query'
import { apiClient } from '@/client/api.ts'
import { unwrap } from '@/client/errors.ts'

export type InboxView = 'pending' | 'unread' | 'unassigned' | 'all'

export interface InboxFilters {
  view: InboxView
  search: string
  channel: string
  delegateId: string
}

/** TanStack Query keys of the inbox. They include the active organization. */
export const inboxKeys = {
  all: (orgId: string) => ['org', orgId, 'inbox'] as const,
  list: (orgId: string, f: InboxFilters) => ['org', orgId, 'inbox', 'list', f] as const,
  counts: (orgId: string, channel: string, delegateId: string) =>
    ['org', orgId, 'inbox', 'counts', channel, delegateId] as const,
  channels: (orgId: string) => ['org', orgId, 'inbox', 'channels'] as const,
  detail: (orgId: string, id: string) => ['org', orgId, 'inbox', 'detail', id] as const,
  thread: (orgId: string, id: string) => ['org', orgId, 'inbox', 'thread', id] as const,
}

const LIST_POLL_MS = 15_000
const THREAD_POLL_MS = 5_000

export function useConversations(orgId: string, f: InboxFilters) {
  return useQuery({
    queryKey: inboxKeys.list(orgId, f),
    refetchInterval: LIST_POLL_MS,
    queryFn: async () =>
      unwrap(
        await apiClient.GET('/api/v1/conversations', {
          params: {
            query: {
              view: f.view,
              ...(f.search ? { search: f.search } : {}),
              ...(f.channel ? { channel: f.channel } : {}),
              ...(f.delegateId ? { delegateId: f.delegateId } : {}),
            },
          },
        }),
      ).items,
  })
}

export function useInboxCounts(orgId: string, channel: string, delegateId: string) {
  return useQuery({
    queryKey: inboxKeys.counts(orgId, channel, delegateId),
    refetchInterval: LIST_POLL_MS,
    queryFn: async () =>
      unwrap(
        await apiClient.GET('/api/v1/conversations/counts', {
          params: {
            query: {
              ...(channel ? { channel } : {}),
              ...(delegateId ? { delegateId } : {}),
            },
          },
        }),
      ),
  })
}

export function useInboxChannels(orgId: string) {
  return useQuery({
    queryKey: inboxKeys.channels(orgId),
    queryFn: async () => unwrap(await apiClient.GET('/api/v1/conversations/channels')).items,
  })
}

export function useConversation(orgId: string, id: string) {
  return useQuery({
    queryKey: inboxKeys.detail(orgId, id),
    retry: false,
    refetchInterval: THREAD_POLL_MS,
    queryFn: async () =>
      unwrap(await apiClient.GET('/api/v1/conversations/{id}', { params: { path: { id } } })),
  })
}

export function useThread(orgId: string, id: string) {
  return useQuery({
    queryKey: inboxKeys.thread(orgId, id),
    refetchInterval: THREAD_POLL_MS,
    queryFn: async () =>
      unwrap(
        await apiClient.GET('/api/v1/conversations/{id}/messages', { params: { path: { id } } }),
      ).items,
  })
}
