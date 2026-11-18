'use client'

import { useQuery } from '@tanstack/react-query'
import { apiClient } from '@/client/api.ts'
import { unwrap } from '@/client/errors.ts'

/** TanStack Query keys of the tasks. They include the active organization. */
export const taskKeys = {
  all: (orgId: string) => ['org', orgId, 'tasks'] as const,
  list: (orgId: string, status: string) => ['org', orgId, 'tasks', 'list', status] as const,
  detail: (orgId: string, id: string) => ['org', orgId, 'tasks', id] as const,
  activity: (orgId: string, id: string) => ['org', orgId, 'tasks', id, 'activity'] as const,
}

export function useTasks(orgId: string, status: 'all' | 'pending' | 'done') {
  return useQuery({
    queryKey: taskKeys.list(orgId, status),
    queryFn: async () =>
      unwrap(await apiClient.GET('/api/v1/tasks', { params: { query: { status } } })).items,
  })
}

export function useTask(orgId: string, id: string) {
  return useQuery({
    queryKey: taskKeys.detail(orgId, id),
    retry: false,
    queryFn: async () =>
      unwrap(await apiClient.GET('/api/v1/tasks/{id}', { params: { path: { id } } })),
  })
}

export function useTaskActivity(orgId: string, id: string) {
  return useQuery({
    queryKey: taskKeys.activity(orgId, id),
    queryFn: async () =>
      unwrap(await apiClient.GET('/api/v1/tasks/{id}/activity', { params: { path: { id } } }))
        .items,
  })
}
