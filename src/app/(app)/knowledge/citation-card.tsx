import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import type { KnowledgeSearchResult } from "@/modules/knowledge/retrieval";
import {
  CHUNK_LEVEL_LABELS,
  VERSION_STATUS_LABELS,
  VERSION_STATUS_TONES,
  formatVigencia,
} from "@/app/(app)/knowledge/labels";

/**
 * One retrieved chunk with its verifiable provenance — source, version,
 * vigencia and location are always shown (`CLAUDE.md` §2, principle 3).
 * `EvidenceLevel` is deliberately absent: it is computed by the AI Copilot
 * (Fase 8), not by retrieval.
 */
export function CitationCard({ result }: { result: KnowledgeSearchResult }) {
  const location = [CHUNK_LEVEL_LABELS[result.level], result.label].filter(Boolean).join(" ");
  return (
    <Card>
      <CardContent>
        <div className="flex flex-wrap items-center gap-2">
          <Link
            href={`/knowledge/${result.documentId}`}
            className="focus-ring rounded-sm font-medium text-foreground"
          >
            {result.documentTitle}
          </Link>
          <Badge tone={VERSION_STATUS_TONES[result.status]}>{VERSION_STATUS_LABELS[result.status]}</Badge>
        </div>
        <p className="type-body text-foreground-lighter">
          Versión {result.version} · {formatVigencia(result.effectiveFrom, result.effectiveUntil)}
          {result.sourceNote ? ` · ${result.sourceNote}` : ""}
        </p>
        <p className="type-body text-foreground-lighter">
          {location}
          {result.path ? ` · ${result.path}` : ""}
        </p>
        <blockquote className="type-body whitespace-pre-line text-foreground">{result.content}</blockquote>
        {result.documentSourceUrl && (
          <a
            href={result.documentSourceUrl}
            target="_blank"
            rel="noreferrer noopener"
            className="focus-ring type-body rounded-sm text-foreground-lighter underline"
          >
            Ver fuente original
          </a>
        )}
      </CardContent>
    </Card>
  );
}
