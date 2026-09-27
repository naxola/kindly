import type { CaseStatus } from "@/modules/cases/schema";
import type { BadgeProps } from "@/components/ui/badge";

/**
 * Display-only Spanish labels for `CaseStatus` (docs/ui/PRINCIPLES.md §5:
 * código en inglés, interfaz en español). The enum values themselves stay
 * in English — they're identifiers, not UI text (`CLAUDE.md` §1).
 */
export const CASE_STATUS_LABELS: Record<CaseStatus, string> = {
  OPEN: "Abierto",
  IN_PROGRESS: "En curso",
  WAITING: "En espera",
  RESOLVED: "Resuelto",
  CLOSED: "Cerrado",
};

export const CASE_STATUS_TONES: Record<CaseStatus, NonNullable<BadgeProps["tone"]>> = {
  OPEN: "info",
  IN_PROGRESS: "primary",
  WAITING: "warning",
  RESOLVED: "success",
  CLOSED: "neutral",
};
