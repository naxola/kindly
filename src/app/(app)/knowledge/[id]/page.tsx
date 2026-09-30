import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { requireCurrentOrganizationMember } from "@/modules/organizations/service";
import { getDocumentWithVersions, listChunksForVersion } from "@/modules/knowledge/service";
import {
  CHUNK_LEVEL_LABELS,
  SOURCE_TYPE_LABELS,
  VERSION_STATUS_LABELS,
  VERSION_STATUS_TONES,
  VISIBILITY_LABELS,
  formatVigencia,
} from "@/app/(app)/knowledge/labels";
import { PageContainer } from "@/components/patterns/page-container";
import { PageHeader } from "@/components/patterns/page-header";
import { PageSection } from "@/components/patterns/page-section";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { pageTitle } from "@/lib/page-title";

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const { id } = await params;
  const member = await requireCurrentOrganizationMember();
  const found = await getDocumentWithVersions(id, member.organizationId);
  return { title: pageTitle(found?.document.title, "Conocimiento", member.organizationName) };
}

export default async function KnowledgeDocumentPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const member = await requireCurrentOrganizationMember();
  const found = await getDocumentWithVersions(id, member.organizationId);

  if (!found) {
    notFound();
  }

  const { document, versions } = found;
  const chunksByVersion = await Promise.all(
    versions.map((version) => listChunksForVersion(version.id, member.organizationId)),
  );
  const scope = [document.jurisdiction, document.territory, document.scope].filter(Boolean).join(" · ");

  return (
    <PageContainer>
      <PageHeader
        title={document.title}
        description={[VISIBILITY_LABELS[document.visibility], SOURCE_TYPE_LABELS[document.sourceType], scope]
          .filter(Boolean)
          .join(" · ")}
        aside={
          document.sourceUrl ? (
            <a
              href={document.sourceUrl}
              target="_blank"
              rel="noreferrer noopener"
              className="focus-ring type-body rounded-sm text-foreground-lighter underline"
            >
              Ver fuente original
            </a>
          ) : undefined
        }
      />

      <PageSection title="Versiones" description="De la más reciente a la más antigua">
        {versions.length === 0 && <p className="type-body text-foreground-lighter">Este documento no tiene versiones.</p>}
        {versions.map((version, i) => (
          <Card key={version.id}>
            <CardHeader>
              <CardTitle className="flex flex-wrap items-center gap-2">
                Versión {version.version}
                <Badge tone={VERSION_STATUS_TONES[version.status]}>{VERSION_STATUS_LABELS[version.status]}</Badge>
              </CardTitle>
              <p className="type-body text-foreground-lighter">
                {formatVigencia(version.effectiveFrom, version.effectiveUntil)}
                {version.source ? ` · ${version.source}` : ""}
              </p>
            </CardHeader>
            <CardContent>
              {chunksByVersion[i].length === 0 && (
                <p className="type-body text-foreground-lighter">Sin fragmentos.</p>
              )}
              {chunksByVersion[i].map((chunk) => (
                <div key={chunk.id} className="flex flex-col gap-1">
                  <p className="type-label text-foreground-light">
                    {[CHUNK_LEVEL_LABELS[chunk.level], chunk.label].filter(Boolean).join(" ")}
                    {chunk.path ? ` · ${chunk.path}` : ""}
                  </p>
                  <p className="type-body whitespace-pre-line text-foreground">{chunk.content}</p>
                </div>
              ))}
            </CardContent>
          </Card>
        ))}
      </PageSection>
    </PageContainer>
  );
}
