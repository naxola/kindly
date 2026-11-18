'use client'

import { useQuery } from '@tanstack/react-query'
import { apiClient } from '@/client/api.ts'
import { unwrap } from '@/client/errors.ts'

export const procedureKeys = {
  all: (orgId: string) => ['org', orgId, 'procedures'] as const,
  list: (orgId: string) => ['org', orgId, 'procedures', 'list'] as const,
  detail: (orgId: string, id: string) => ['org', orgId, 'procedures', id] as const,
}

export function useProcedures(orgId: string) {
  return useQuery({
    queryKey: procedureKeys.list(orgId),
    queryFn: async () => unwrap(await apiClient.GET('/api/v1/procedures')).items,
  })
}

export function useProcedure(orgId: string, id: string) {
  return useQuery({
    queryKey: procedureKeys.detail(orgId, id),
    retry: false,
    queryFn: async () =>
      unwrap(await apiClient.GET('/api/v1/procedures/{id}', { params: { path: { id } } })),
  })
}

/** One item per line, as the form sends them (the server trims, drops blanks and repeats). */
export const lines = (text: string) => text.split(/\r?\n/)
