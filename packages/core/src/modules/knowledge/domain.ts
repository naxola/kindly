import type { DocumentVersionStatus } from '@saas/database'

/** Length of the vectors `knowledge_chunks.embedding` holds: one source of truth. */
export const EMBEDDING_DIMENSIONS = 1536

/** The minimal shape `selectApplicableVersion` needs from a version row. */
export interface VersionForSelection {
  status: DocumentVersionStatus
  /** 'YYYY-MM-DD'. */
  effectiveFrom: string
  /** 'YYYY-MM-DD' or null (open-ended: still in force). */
  effectiveUntil: string | null
}

/**
 * Statuses that can ever be *applicable* to a date. `DRAFT` was never in force and `REPEALED` was
 * struck without a successor period, so neither is returned even if its dates bracket the target.
 * `SUPERSEDED` and `HISTORICAL` stay eligible on purpose: a version that is no longer current is
 * exactly what a question about a past date must resolve to (docs/DATABASE.md §15). Exported so the
 * retrieval query reproduces the same rule in SQL instead of duplicating the list.
 */
export const APPLICABLE_STATUSES: ReadonlySet<DocumentVersionStatus> = new Set([
  'CURRENT',
  'SUPERSEDED',
  'HISTORICAL',
])

const toDay = (date: Date | string): string =>
  typeof date === 'string' ? date : date.toISOString().slice(0, 10)

/**
 * The version of a document applicable at `atDate`, or null. It applies when its status is
 * applicable and `effectiveFrom <= atDate <= effectiveUntil` (null = open-ended). If several
 * overlap (they should not), the latest `effectiveFrom` wins: the most specific period.
 */
export function selectApplicableVersion<V extends VersionForSelection>(
  versions: readonly V[],
  atDate: Date | string,
): V | null {
  const target = toDay(atDate)
  const applicable = versions.filter(
    (v) =>
      APPLICABLE_STATUSES.has(v.status) &&
      v.effectiveFrom <= target &&
      (v.effectiveUntil === null || target <= v.effectiveUntil),
  )
  if (applicable.length === 0) return null
  return applicable.reduce((best, v) => (v.effectiveFrom > best.effectiveFrom ? v : best))
}
