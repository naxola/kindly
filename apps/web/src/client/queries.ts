'use client'

import { useQuery } from '@tanstack/react-query'
import { apiClient } from './api.ts'
import { unwrap } from './errors.ts'

/** TanStack Query keys of identity and organization. They include the active organization. */
export const keys = {
  members: (orgId: string) => ['org', orgId, 'members'] as const,
  invitations: (orgId: string) => ['org', orgId, 'invitations'] as const,
  positions: (orgId: string) => ['org', orgId, 'positions'] as const,
}

export function useMembers(orgId: string) {
  return useQuery({
    queryKey: keys.members(orgId),
    queryFn: async () => unwrap(await apiClient.GET('/api/v1/members')).items,
  })
}

export function useInvitations(orgId: string, enabled = true) {
  return useQuery({
    queryKey: keys.invitations(orgId),
    enabled,
    queryFn: async () => unwrap(await apiClient.GET('/api/v1/invitations')).items,
  })
}

/** Positions (cargos). Archived ones only for whoever manages them. */
export function usePositions(orgId: string, includeArchived = false) {
  return useQuery({
    queryKey: [...keys.positions(orgId), { includeArchived }],
    queryFn: async () =>
      unwrap(
        await apiClient.GET('/api/v1/positions', {
          params: { query: includeArchived ? { includeArchived: 'true' } : {} },
        }),
      ).items,
  })
}

export const billingKeys = {
  overview: (orgId: string) => ['org', orgId, 'billing'] as const,
  periods: (orgId: string) => ['org', orgId, 'billing', 'periods'] as const,
}

export function useBillingOverview(orgId: string) {
  return useQuery({
    queryKey: billingKeys.overview(orgId),
    queryFn: async () => unwrap(await apiClient.GET('/api/v1/billing')),
  })
}

export function useBillingPeriods(orgId: string, enabled = true) {
  return useQuery({
    queryKey: billingKeys.periods(orgId),
    enabled,
    queryFn: async () => unwrap(await apiClient.GET('/api/v1/billing/periods')).items,
  })
}

export function useBillingPlans(orgId: string, enabled = true) {
  return useQuery({
    queryKey: ['org', orgId, 'billing', 'plans'],
    enabled,
    queryFn: async () => unwrap(await apiClient.GET('/api/v1/billing/plans')).items,
  })
}
