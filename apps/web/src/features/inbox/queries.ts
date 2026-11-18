'use client'

import { queryOptions, useQuery } from '@tanstack/react-query'
import { apiClient } from '@/client/api.ts'
import { unwrap } from '@/client/errors.ts'
import { taskKeys } from '../tasks/queries.ts'

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
  /** Every conversation of one contact (the ficha's "other conversations"). */
  ofContact: (orgId: string, contactId: string) =>
    ['org', orgId, 'inbox', 'contact', contactId] as const,
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

/** Options shared by the hooks and by the prefetch on hover, so both fill the same cache entry. */
export const conversationQuery = (orgId: string, id: string) =>
  queryOptions({
    queryKey: inboxKeys.detail(orgId, id),
    retry: false,
    refetchInterval: THREAD_POLL_MS,
    queryFn: async () =>
      unwrap(await apiClient.GET('/api/v1/conversations/{id}', { params: { path: { id } } })),
  })

export const threadQuery = (orgId: string, id: string) =>
  queryOptions({
    queryKey: inboxKeys.thread(orgId, id),
    refetchInterval: THREAD_POLL_MS,
    queryFn: async () =>
      unwrap(
        await apiClient.GET('/api/v1/conversations/{id}/messages', { params: { path: { id } } }),
      ).items,
  })

export const useConversation = (orgId: string, id: string) => useQuery(conversationQuery(orgId, id))
export const useThread = (orgId: string, id: string) => useQuery(threadQuery(orgId, id))

/** Conversations of a contact on any channel and account the person may see, newest first. */
export function useContactConversations(orgId: string, contactId: string) {
  return useQuery({
    queryKey: inboxKeys.ofContact(orgId, contactId),
    refetchInterval: LIST_POLL_MS,
    queryFn: async () =>
      unwrap(
        await apiClient.GET('/api/v1/conversations', {
          params: { query: { view: 'all', contactId } },
        }),
      ).items,
  })
}

/** Open tasks about a contact (a task is open exactly when it has no completion date). */
export function useContactOpenTasks(orgId: string, contactId: string) {
  return useQuery({
    queryKey: [...taskKeys.all(orgId), 'contact', contactId] as const,
    queryFn: async () =>
      unwrap(
        await apiClient.GET('/api/v1/tasks', {
          params: { query: { status: 'pending', contactId } },
        }),
      ).items,
  })
}

export type ConversationDetailData = NonNullable<ReturnType<typeof useConversation>['data']>
export type ThreadMessageData = NonNullable<ReturnType<typeof useThread>['data']>[number]
