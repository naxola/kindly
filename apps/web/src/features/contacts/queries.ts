'use client'

import { useQuery } from '@tanstack/react-query'
import { apiClient } from '@/client/api.ts'
import { unwrap } from '@/client/errors.ts'

/** TanStack Query keys of the CRM. They include the active organization. */
export const contactKeys = {
  all: (orgId: string) => ['org', orgId, 'contacts'] as const,
  list: (orgId: string) => ['org', orgId, 'contacts', 'list'] as const,
  detail: (orgId: string, id: string) => ['org', orgId, 'contacts', id] as const,
  delegates: (orgId: string, id: string) => ['org', orgId, 'contacts', id, 'delegates'] as const,
  affiliation: (orgId: string, id: string) =>
    ['org', orgId, 'contacts', id, 'affiliation'] as const,
  activity: (orgId: string, id: string) => ['org', orgId, 'contacts', id, 'activity'] as const,
}

export function useContacts(orgId: string) {
  return useQuery({
    queryKey: contactKeys.list(orgId),
    queryFn: async () => unwrap(await apiClient.GET('/api/v1/contacts')).items,
  })
}

export function useContact(orgId: string, id: string) {
  return useQuery({
    queryKey: contactKeys.detail(orgId, id),
    // A contact the person may not see answers 404: retrying would not change that.
    retry: false,
    queryFn: async () =>
      unwrap(await apiClient.GET('/api/v1/contacts/{id}', { params: { path: { id } } })),
  })
}

export function useContactDelegates(orgId: string, id: string) {
  return useQuery({
    queryKey: contactKeys.delegates(orgId, id),
    queryFn: async () =>
      unwrap(await apiClient.GET('/api/v1/contacts/{id}/delegates', { params: { path: { id } } }))
        .items,
  })
}

export function useContactAffiliation(orgId: string, id: string) {
  return useQuery({
    queryKey: contactKeys.affiliation(orgId, id),
    queryFn: async () =>
      unwrap(
        await apiClient.GET('/api/v1/contacts/{id}/affiliation', { params: { path: { id } } }),
      ),
  })
}

export function useContactActivity(orgId: string, id: string) {
  return useQuery({
    queryKey: contactKeys.activity(orgId, id),
    queryFn: async () =>
      unwrap(await apiClient.GET('/api/v1/contacts/{id}/activity', { params: { path: { id } } }))
        .items,
  })
}
