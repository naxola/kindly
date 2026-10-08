import type { Metadata } from "next";
import Link from "next/link";
import { requireCurrentOrganizationMember } from "@/modules/organizations/service";
import { listKnowledgeSources } from "@/modules/knowledge/service";
import { getEmbeddingProvider, hasEmbeddingProvider } from "@/modules/knowledge/embedding-provider";
import { reindexKnowledgeSourceAction } from "@/modules/knowledge/actions";
import {
  deriveIndexStatus,
  filterSources,
  formatCharacterCount,
  summarizeUsage,
} from "@/modules/knowledge/source-status";
import { retrieveKnowledge, type KnowledgeSearchResult } from "@/modules/knowledge/retrieval";
import { UploadDocumentSheet } from "@/app/(app)/knowledge/upload-document-sheet";
import { CitationCard } from "@/app/(app)/knowledge/citation-card";
import {
  formatDay,
  INDEX_STATUS_LABELS,
  INDEX_STATUS_TONES,
  SOURCE_TYPE_LABELS,
  VISIBILITY_LABELS,
} from "@/app/(app)/knowledge/labels";
import { PageContainer } from "@/components/patterns/page-container";
import { PageHeader } from "@/components/patterns/page-header";
import { PageSection } from "@/components/patterns/page-section";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { FilterBar } from "@/components/ui/filter-bar";
import { Input, NativeSelect } from "@/components/ui/input";
import { SubmitButton } from "@/components/ui/submit-button";
import { Table, TableBody, TableCell, TableEmpty, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { pageTitle } from "@/lib/page-title";

// Uploading embeds every chunk in the request: give the Server Action room (Vercel).
export const maxDuration = 60;

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

const TYPE_FILTER_OPTIONS = [
  { value: "", label: "Todos los tipos" },
  { value: "PDF", label: "PDF" },
  { value: "MANUAL", label: "Texto" },
  { value: "WEB", label: "Web" },
] as const;

export default async function KnowledgePage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; fuente?: string; tipo?: string }>;
}) {
  const { q, fuente, tipo } = await searchParams;
  const query = q?.trim() ?? "";
  const sourceText = fuente?.trim() ?? "";
  const sourceType = TYPE_FILTER_OPTIONS.some((option) => option.value === tipo) ? (tipo ?? "") : "";
  const member = await requireCurrentOrganizationMember();
  // Without a registered provider (dev/CI without a key) staleness cannot be told.
  const activeModel = hasEmbeddingProvider() ? getEmbeddingProvider().id : null;
  const [sources, outcome] = await Promise.all([
    listKnowledgeSources(member.organizationId, activeModel),
    query ? search(member.organizationId, query) : Promise.resolve(null),
  ]);
  const usage = summarizeUsage(sources);
  const visibleSources = filterSources(sources, { text: sourceText, type: sourceType });
  const isAdmin = member.role === "ADMIN";

  return (
    <PageContainer>
      <PageHeader
        title="Conocimiento"
        description="Normativa y documentación con fuente, versión y vigencia verificables"
        aside={
          <>
            <Link href="/knowledge/procedures" className="focus-ring type-body rounded-sm text-foreground-lighter underline">
              Trámites
            </Link>
            {isAdmin && <UploadDocumentSheet />}
          </>
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

      <PageSection
        title="Fuentes de conocimiento"
        description="Lo que la IA puede citar. Solo se guarda el texto extraído, no los archivos"
      >
        <dl className="type-body flex flex-wrap gap-x-8 gap-y-2" aria-label="Texto indexado de tu organización">
          <div>
            <dt className="text-foreground-lighter">Fuentes propias</dt>
            <dd className="font-medium text-foreground">{formatCharacterCount(usage.sourceCount)}</dd>
          </div>
          <div>
            <dt className="text-foreground-lighter">Fragmentos indexados</dt>
            <dd className="font-medium text-foreground">{formatCharacterCount(usage.chunkCount)}</dd>
          </div>
          <div>
            <dt className="text-foreground-lighter">Caracteres indexados</dt>
            <dd className="font-medium text-foreground">{formatCharacterCount(usage.characterCount)}</dd>
          </div>
        </dl>

        <form method="get" role="search" aria-label="Filtrar fuentes">
          {query && <input type="hidden" name="q" value={query} />}
          <FilterBar
            search={<Input type="search" name="fuente" defaultValue={sourceText} placeholder="Filtrar por título" aria-label="Filtrar por título" />}
            filters={
              <NativeSelect name="tipo" defaultValue={sourceType} aria-label="Tipo de fuente" className="w-auto">
                {TYPE_FILTER_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </NativeSelect>
            }
            actions={<Button type="submit">Filtrar</Button>}
          />
        </form>

        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Conocimiento</TableHead>
              <TableHead>Ámbito</TableHead>
              <TableHead>Visibilidad</TableHead>
              <TableHead>Añadido</TableHead>
              <TableHead>Estado</TableHead>
              {isAdmin && <TableHead>Acciones</TableHead>}
            </TableRow>
          </TableHeader>
          <TableBody>
            {visibleSources.map((doc) => {
              const status = deriveIndexStatus({
                chunkCount: doc.chunkCount,
                staleChunkCount: doc.staleChunkCount,
                providerKnown: activeModel !== null,
              });
              const canReindex = isAdmin && status === "OUTDATED" && doc.organizationId === member.organizationId;
              return (
                <TableRow key={doc.id}>
                  <TableCell className="font-medium text-foreground">
                    <Link href={`/knowledge/${doc.id}`} className="focus-ring rounded-sm">
                      {doc.title}
                    </Link>
                    <div className="mt-1">
                      <Badge tone="outline">{SOURCE_TYPE_LABELS[doc.sourceType]}</Badge>
                    </div>
                  </TableCell>
                  <TableCell className="text-foreground-lighter">
                    {[doc.jurisdiction, doc.territory, doc.scope].filter(Boolean).join(" · ") || "—"}
                  </TableCell>
                  <TableCell>
                    <Badge tone={doc.visibility === "GLOBAL" ? "info" : "neutral"}>{VISIBILITY_LABELS[doc.visibility]}</Badge>
                  </TableCell>
                  <TableCell className="text-foreground-lighter">{formatDay(doc.createdAt.toISOString().slice(0, 10))}</TableCell>
                  <TableCell>
                    <Badge tone={INDEX_STATUS_TONES[status]}>{INDEX_STATUS_LABELS[status]}</Badge>
                    <div className="type-body mt-1 text-foreground-lighter">
                      {formatCharacterCount(doc.chunkCount)} fragmentos · {formatCharacterCount(doc.characterCount)} caracteres
                    </div>
                  </TableCell>
                  {isAdmin && (
                    <TableCell>
                      {canReindex && (
                        <form action={reindexKnowledgeSourceAction.bind(null, doc.id)}>
                          <SubmitButton variant="outline" size="sm">
                            Reindexar
                          </SubmitButton>
                        </form>
                      )}
                    </TableCell>
                  )}
                </TableRow>
              );
            })}
            {visibleSources.length === 0 && (
              <TableEmpty
                colSpan={isAdmin ? 6 : 5}
                title={sources.length === 0 ? "Todavía no hay conocimiento" : "Ninguna fuente coincide"}
                description={
                  sources.length === 0
                    ? isAdmin
                      ? "Añade el primero con «Añadir conocimiento»."
                      : "Un administrador puede añadirlo."
                    : "Prueba con otro título o tipo."
                }
              />
            )}
          </TableBody>
        </Table>
      </PageSection>
    </PageContainer>
  );
}
