/**
 * Pure Case lifecycle rules — no DB import, so they're unit-testable without
 * PostgreSQL, same shape as `memberships/domain.ts`/`tasks/domain.ts`.
 *
 * Fase 6 (`project/TASKS.md`) replaces PKG-002's "any member can set any
 * status" (docs/DECISIONS.md) with a real state machine: forward in order,
 * `WAITING` can step back to `IN_PROGRESS`, `RESOLVED` can reopen to
 * `IN_PROGRESS`, `CLOSED` is terminal.
 */
import type { CaseStatus } from "@/modules/cases/schema";

export const CASE_STATUS_TRANSITIONS: Record<CaseStatus, CaseStatus[]> = {
  OPEN: ["IN_PROGRESS"],
  IN_PROGRESS: ["WAITING", "RESOLVED"],
  WAITING: ["IN_PROGRESS", "RESOLVED"],
  RESOLVED: ["IN_PROGRESS", "CLOSED"],
  CLOSED: [],
};

/** Keeping the current status is always valid — the edit form saves other fields too. */
export function isValidCaseStatusTransition(from: CaseStatus, to: CaseStatus): boolean {
  return from === to || CASE_STATUS_TRANSITIONS[from].includes(to);
}
