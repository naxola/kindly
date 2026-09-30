import type { Metadata } from "next";
import Link from "next/link";
import { requireCurrentOrganizationMember } from "@/modules/organizations/service";
import { listDocumentsForOrganization } from "@/modules/knowledge/service";
import { retrieveKnowledge, type KnowledgeSearchResult } from "@/modules/knowledge/retrieval";
import { CitationCard } from "@/app/(app)/knowledge/citation-card";
import { SOURCE_TYPE_LABELS, VISIBILITY_LABELS } from "@/app/(app)/knowledge/labels";
import { PageContainer } from "@/components/patterns/page-container";
import { PageHeader } from "@/components/patterns/page-header";
import { PageSection } from "@/components/patterns/page-section";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableEmpty, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { pageTitle } from "@/lib/page-title";

export async function generateMetadata(): Promise<Metadata> {
  const member = await requireCurrentOrganizationMember();
  return { title: pageTitle("Conocimiento", member.organizationName) };
}

type SearchOutcome =
  | { kind: "results"; results: KnowledgeSearchResult[] }
  | { kind: "unavailable" };

async function search(organizationId: string, query: string): Promise<SearchOutcome> {
  try {
    return { kind: "results", results: await retrieveKnowledge({ organizationId, query }) };
  } catch (error) {
    // Retrieval needs a registered EmbeddingProvider (no OPENAI_API_KEY in
    // dev/CI). Say so instead of failing the page or faking an empty result.
    console.error("Knowledge search failed", error);
    return { kind: "unavailable" };
  }
}

export default async function KnowledgePage({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  const { q } = await searchParams;
  const query = q?.trim() ?? "";
  const member = await requireCurrentOrganizationMember();
  const [documents, outcome] = await Promise.all([
    listDocumentsForOrganization(member.organizationId),
    query ? search(member.organizationId, query) : Promise.resolve(null),
  ]);

  return (
    <PageContainer>
      <PageHeader
        title="Conocimiento"
        description="Normativa y documentación con fuente, versión y vigencia verificables"
        aside={
          <Link href="/knowledge/procedures" className="focus-ring type-body rounded-sm text-foreground-lighter underline">
            Trámites
          </Link>
        }
      />

      <PageSection title="Buscar" description="Solo devuelve versiones aplicables hoy">
        <form method="get" role="search" className="flex max-w-page-sm gap-2">
          <Input type="search" name="q" defaultValue={query} placeholder="Buscar en el conocimiento" aria-label="Buscar en el conocimiento" />
          <Button type="submit">Buscar</Button>
        </form>

        {outcome?.kind === "unavailable" && (
          <Alert tone="warning" title="La búsqueda no está disponible">
            El servicio de embeddings no está configurado en este entorno.
          </Alert>
        )}
        {outcome?.kind === "results" &&
          (outcome.results.length === 0 ? (
            <EmptyState variant="inline" title="Sin resultados" description="Prueba con otras palabras." />
          ) : (
            <ul className="flex flex-col gap-3" aria-label="Resultados de la búsqueda">
              {outcome.results.map((result) => (
                <li key={result.chunkId}>
                  <CitationCard result={result} />
                </li>
              ))}
            </ul>
          ))}
      </PageSection>

      <PageSection title="Documentos">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Título</TableHead>
              <TableHead>Origen</TableHead>
              <TableHead>Ámbito</TableHead>
              <TableHead>Visibilidad</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {documents.map((doc) => (
              <TableRow key={doc.id}>
                <TableCell className="font-medium text-foreground">
                  <Link href={`/knowledge/${doc.id}`} className="focus-ring rounded-sm">
                    {doc.title}
                  </Link>
                </TableCell>
                <TableCell className="text-foreground-lighter">{SOURCE_TYPE_LABELS[doc.sourceType]}</TableCell>
                <TableCell className="text-foreground-lighter">
                  {[doc.jurisdiction, doc.territory, doc.scope].filter(Boolean).join(" · ") || "—"}
                </TableCell>
                <TableCell>
                  <Badge tone={doc.visibility === "GLOBAL" ? "info" : "neutral"}>{VISIBILITY_LABELS[doc.visibility]}</Badge>
                </TableCell>
              </TableRow>
            ))}
            {documents.length === 0 && (
              <TableEmpty
                colSpan={4}
                title="Todavía no hay documentos"
                description="La ingesta de documentos se hace por ahora desde el script de operador."
              />
            )}
          </TableBody>
        </Table>
      </PageSection>
    </PageContainer>
  );
}
