'use client'

import { useQuery } from '@tanstack/react-query'
import { apiClient } from '@/client/api.ts'
import { ApiError, unwrap, type ApiErrorBody } from '@/client/errors.ts'

export const knowledgeKeys = {
  all: (orgId: string) => ['org', orgId, 'knowledge'] as const,
  list: (orgId: string) => ['org', orgId, 'knowledge', 'list'] as const,
  detail: (orgId: string, id: string) => ['org', orgId, 'knowledge', 'doc', id] as const,
  chunks: (orgId: string, versionId: string) =>
    ['org', orgId, 'knowledge', 'chunks', versionId] as const,
  search: (orgId: string, q: string, atDate: string) =>
    ['org', orgId, 'knowledge', 'search', q, atDate] as const,
}

const POLL_MS = 3_000
type Doc = { versions: { ingestionStatus: string }[] }
const inFlight = (docs: Doc[] | undefined) =>
  !!docs?.some((d) =>
    d.versions.some((v) => v.ingestionStatus === 'PENDING' || v.ingestionStatus === 'PROCESSING'),
  )

/** Documents; while any version is still being ingested the list refreshes by itself. */
export function useKnowledgeDocuments(orgId: string) {
  return useQuery({
    queryKey: knowledgeKeys.list(orgId),
    refetchInterval: (q) => (inFlight(q.state.data) ? POLL_MS : false),
    queryFn: async () => unwrap(await apiClient.GET('/api/v1/knowledge/documents')).items,
  })
}

export function useKnowledgeDocument(orgId: string, id: string) {
  return useQuery({
    queryKey: knowledgeKeys.detail(orgId, id),
    retry: false,
    refetchInterval: (q) => (q.state.data && inFlight([q.state.data]) ? POLL_MS : false),
    queryFn: async () =>
      unwrap(await apiClient.GET('/api/v1/knowledge/documents/{id}', { params: { path: { id } } })),
  })
}

export function useVersionChunks(orgId: string, versionId: string, enabled: boolean) {
  return useQuery({
    queryKey: knowledgeKeys.chunks(orgId, versionId),
    enabled,
    queryFn: async () =>
      unwrap(
        await apiClient.GET('/api/v1/knowledge/versions/{id}/chunks', {
          params: { path: { id: versionId } },
        }),
      ).items,
  })
}

export function useKnowledgeSearch(orgId: string, q: string, atDate: string) {
  return useQuery({
    queryKey: knowledgeKeys.search(orgId, q, atDate),
    enabled: q.length > 0,
    retry: false,
    queryFn: async () =>
      unwrap(
        await apiClient.GET('/api/v1/knowledge/search', {
          params: { query: { q, ...(atDate ? { atDate } : {}) } },
        }),
      ).items,
  })
}

/** Posts a multipart form (an upload) and throws the same `ApiError` the typed client does. */
export async function postForm<T>(path: string, form: FormData): Promise<T> {
  const res = await fetch(path, { method: 'POST', body: form })
  if (!res.ok) {
    throw new ApiError(res.status, (await res.json().catch(() => null)) as ApiErrorBody | null)
  }
  return (await res.json()) as T
}

export type KnowledgeDocumentData = NonNullable<ReturnType<typeof useKnowledgeDocument>['data']>
export type KnowledgeVersionData = KnowledgeDocumentData['versions'][number]
export type KnowledgeResult = NonNullable<ReturnType<typeof useKnowledgeSearch>['data']>[number]
