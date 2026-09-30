/**
 * Pure knowledge domain logic — no DB, no I/O, so it unit-tests directly
 * (Fase 7a). The retrieval layer (7c) and the AI Copilot (Fase 8) reuse
 * this to pick the *applicable* version of a document, not merely the
 * current one.
 */
import type { DocumentVersionStatus } from "@/modules/knowledge/schema";

/** The minimal shape `selectApplicableVersion` needs from a version row. */
export interface VersionForSelection {
  status: DocumentVersionStatus;
  /** 'YYYY-MM-DD'. */
  effectiveFrom: string;
  /** 'YYYY-MM-DD' or null (open-ended = still in force). */
  effectiveUntil: string | null;
}

/**
 * Statuses that can ever be *applicable* to a date. `DRAFT` was never in
 * force and `REPEALED` was struck without a successor period, so neither is
 * returned even if its dates happen to bracket the target. `SUPERSEDED` and
 * `HISTORICAL` stay eligible on purpose: a version that is no longer current
 * is exactly what a question about a past date must resolve to
 * (`docs/DATABASE.md` §15, version-aware retrieval).
 *
 * Exported so `retrieval.ts` (Fase 7c) can reproduce the same rule as a SQL
 * condition over many documents at once, instead of duplicating the list.
 */
export const APPLICABLE_STATUSES: ReadonlySet<DocumentVersionStatus> = new Set([
  "CURRENT",
  "SUPERSEDED",
  "HISTORICAL",
]);

function toDateString(date: Date | string): string {
  return typeof date === "string" ? date : date.toISOString().slice(0, 10);
}

/**
 * The version of a document applicable at `atDate`, or `null` if none.
 *
 * A version applies when its status is applicable and
 * `effectiveFrom <= atDate <= effectiveUntil` (with a null `effectiveUntil`
 * treated as open-ended). 'YYYY-MM-DD' strings compare correctly with `<=`.
 * If several overlap (they shouldn't for well-formed data), the one with the
 * latest `effectiveFrom` wins — the most specific period covering the date.
 */
export function selectApplicableVersion<V extends VersionForSelection>(
  versions: readonly V[],
  atDate: Date | string,
): V | null {
  const target = toDateString(atDate);

  const applicable = versions.filter(
    (v) =>
      APPLICABLE_STATUSES.has(v.status) &&
      v.effectiveFrom <= target &&
      (v.effectiveUntil === null || target <= v.effectiveUntil),
  );

  if (applicable.length === 0) {
    return null;
  }

  return applicable.reduce((best, v) => (v.effectiveFrom > best.effectiveFrom ? v : best));
}
