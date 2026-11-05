import type {
  DocumentVersionStatus,
  KnowledgeChunkLevel,
  KnowledgeDocumentSourceType,
  KnowledgeVisibility,
} from "@/modules/knowledge/schema";
import type { IndexStatus, WebsitePageState } from "@/modules/knowledge/source-status";
import type { BadgeProps } from "@/components/ui/badge";

/** Display-only Spanish labels; the enum values stay identifiers (`CLAUDE.md` §1). */
export const VERSION_STATUS_LABELS: Record<DocumentVersionStatus, string> = {
  DRAFT: "Borrador",
  CURRENT: "Vigente",
  SUPERSEDED: "Sustituida",
  REPEALED: "Derogada",
  HISTORICAL: "Histórica",
};

export const VERSION_STATUS_TONES: Record<DocumentVersionStatus, NonNullable<BadgeProps["tone"]>> = {
  DRAFT: "neutral",
  CURRENT: "success",
  SUPERSEDED: "warning",
  REPEALED: "destructive",
  HISTORICAL: "neutral",
};

export const VISIBILITY_LABELS: Record<KnowledgeVisibility, string> = {
  GLOBAL: "Público",
  ORGANIZATION: "De la organización",
};

export const SOURCE_TYPE_LABELS: Record<KnowledgeDocumentSourceType, string> = {
  MANUAL: "Manual",
  PDF: "PDF",
  WEB: "Web",
};

export const INDEX_STATUS_LABELS: Record<IndexStatus, string> = {
  INDEXED: "Indexado",
  OUTDATED: "Pendiente de reindexar",
  EMPTY: "Sin contenido",
  UNKNOWN: "Sin comprobar",
};

export const INDEX_STATUS_TONES: Record<IndexStatus, NonNullable<BadgeProps["tone"]>> = {
  INDEXED: "success",
  OUTDATED: "warning",
  EMPTY: "neutral",
  UNKNOWN: "neutral",
};

export const WEBSITE_PAGE_STATUS_LABELS: Record<WebsitePageState, string> = {
  DISCOVERED: "Sin indexar",
  PENDING: "En cola",
  INDEXING: "Indexando",
  INDEXED: "Indexada",
  FAILED: "Error",
};

export const WEBSITE_PAGE_STATUS_TONES: Record<WebsitePageState, NonNullable<BadgeProps["tone"]>> = {
  DISCOVERED: "neutral",
  PENDING: "neutral",
  INDEXING: "info",
  INDEXED: "success",
  FAILED: "destructive",
};

export const DISCOVERY_SOURCE_LABELS = {
  sitemap: "Sitemap del sitio",
  feed: "Feed RSS del sitio",
  none: "Solo la dirección indicada (el sitio no publica sitemap ni feed)",
} as const;

export const CHUNK_LEVEL_LABELS: Record<KnowledgeChunkLevel, string> = {
  CHAPTER: "Capítulo",
  SECTION: "Sección",
  ARTICLE: "Artículo",
  PARAGRAPH: "Párrafo",
  FRAGMENT: "Fragmento",
};

/** 'YYYY-MM-DD' → 'DD/MM/YYYY' without a Date round-trip (no timezone drift). */
export function formatDay(day: string): string {
  const [year, month, date] = day.split("-");
  return `${date}/${month}/${year}`;
}

export function formatVigencia(from: string, until: string | null): string {
  return until ? `${formatDay(from)} – ${formatDay(until)}` : `Desde ${formatDay(from)}`;
}
