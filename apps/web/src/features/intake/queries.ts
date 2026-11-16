'use client'

import { useQuery } from '@tanstack/react-query'
import { apiClient } from '@/client/api.ts'
import { unwrap } from '@/client/errors.ts'

/** Altas from the automation and integration keys (administrators). */
export const intakeKeys = {
  all: (orgId: string) => ['org', orgId, 'intake'] as const,
  requests: (orgId: string) => ['org', orgId, 'intake', 'requests'] as const,
  count: (orgId: string) => ['org', orgId, 'intake', 'count'] as const,
  keys: (orgId: string) => ['org', orgId, 'intake', 'keys'] as const,
}

export function useAffiliateRequests(orgId: string) {
  return useQuery({
    queryKey: intakeKeys.requests(orgId),
    queryFn: async () => unwrap(await apiClient.GET('/api/v1/affiliate-requests')),
  })
}

/** Open altas; polled every minute so the ones that arrive with the app open are noticed. */
export function useAffiliateRequestCount(orgId: string, enabled: boolean) {
  return useQuery({
    queryKey: intakeKeys.count(orgId),
    enabled,
    refetchInterval: 60_000,
    queryFn: async () => unwrap(await apiClient.GET('/api/v1/affiliate-requests/count')).open,
  })
}

export function useIntegrationKeys(orgId: string) {
  return useQuery({
    queryKey: intakeKeys.keys(orgId),
    queryFn: async () => unwrap(await apiClient.GET('/api/v1/integration-keys')).items,
  })
}

export type OpenRequests = NonNullable<ReturnType<typeof useAffiliateRequests>['data']>
export type AffiliateRequest = OpenRequests['pending'][number]
export type DelegateLoad = OpenRequests['delegates'][number]
