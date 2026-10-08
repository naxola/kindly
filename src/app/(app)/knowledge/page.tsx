import type { Metadata } from "next";
import Link from "next/link";
import { requireCurrentOrganizationMember } from "@/modules/organizations/service";
import { listKnowledgeSources } from "@/modules/knowledge/service";
import { getEmbeddingProvider, hasEmbeddingProvider } from "@/modules/knowledge/embedding-provider";
import { reindexKnowledgeSourceAction } from "@/modules/knowledge/actions";
import { getWebsite, listWebsites } from "@/modules/knowledge/websites";
import {
  deriveIndexStatus,
  filterSources,
  formatCharacterCount,
  summarizeUsage,
} from "@/modules/knowledge/source-status";
import { retrieveKnowledge, type KnowledgeSearchResult } from "@/modules/knowledge/retrieval";
import { AddKnowledge } from "@/app/(app)/knowledge/add-knowledge";
import { WebsiteSheet, type WebsiteTab } from "@/app/(app)/knowledge/website-sheet";
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

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const WEBSITE_TABS: WebsiteTab[] = ["informacion", "paginas", "configuracion"];

const TYPE_FILTER_OPTIONS = [
  { value: "", label: "Todos los tipos" },
  { value: "PDF", label: "PDF" },
  { value: "MANUAL", label: "Texto" },
  { value: "WEB", label: "Web" },
] as const;

export default async function KnowledgePage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; fuente?: string; tipo?: string; sitio?: string; tab?: string }>;
}) {
  const { q, fuente, tipo, sitio, tab } = await searchParams;
  const query = q?.trim() ?? "";
  const sourceText = fuente?.trim() ?? "";
  const sourceType = TYPE_FILTER_OPTIONS.some((option) => option.value === tipo) ? (tipo ?? "") : "";
  const member = await requireCurrentOrganizationMember();
  // Without a registered provider (dev/CI without a key) staleness cannot be told.
  const activeModel = hasEmbeddingProvider() ? getEmbeddingProvider().id : null;
  const isAdmin = member.role === "ADMIN";
  const openWebsite = isAdmin && sitio && UUID.test(sitio) ? await getWebsite(member.organizationId, sitio) : null;
  const [sources, outcome, websites] = await Promise.all([
    listKnowledgeSources(member.organizationId, activeModel),
    query ? search(member.organizationId, query) : Promise.resolve(null),
    isAdmin ? listWebsites(member.organizationId) : Promise.resolve([]),
  ]);
  const usage = summarizeUsage(sources);
  const visibleSources = filterSources(sources, { text: sourceText, type: sourceType });

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
            {isAdmin && <AddKnowledge />}
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

      {isAdmin && websites.length > 0 && (
        <PageSection title="Sitios web" description="Sitios cuyas páginas eliges indexar">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Sitio</TableHead>
                <TableHead>Páginas</TableHead>
                <TableHead>Estado</TableHead>
                <TableHead>Añadido</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {websites.map((site) => (
                <TableRow key={site.id}>
                  <TableCell className="font-medium text-foreground">
                    <Link href={`/knowledge?sitio=${site.id}`} scroll={false} className="focus-ring rounded-sm">
                      {site.title ?? new URL(site.url).host}
                    </Link>
                    <div className="type-body font-normal text-foreground-lighter">{new URL(site.url).host}</div>
                  </TableCell>
                  <TableCell className="text-foreground-lighter">
                    {site.indexed} de {site.total} indexadas
                  </TableCell>
                  <TableCell>
                    {site.open > 0 ? (
                      <Badge tone="info">Indexando</Badge>
                    ) : site.failed > 0 ? (
                      <Badge tone="destructive">{site.failed} con error</Badge>
                    ) : site.indexed > 0 ? (
                      <Badge tone="success">Indexado</Badge>
                    ) : (
                      <Badge tone="neutral">Sin indexar</Badge>
                    )}
                  </TableCell>
                  <TableCell className="text-foreground-lighter">{formatDay(site.createdAt.toISOString().slice(0, 10))}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </PageSection>
      )}

      {openWebsite && (
        <WebsiteSheet
          website={{
            id: openWebsite.website.id,
            url: openWebsite.website.url,
            title: openWebsite.website.title,
            imageUrl: openWebsite.website.imageUrl,
            discoverySource: openWebsite.website.discoverySource,
            discoveredAt: openWebsite.website.discoveredAt?.toISOString() ?? null,
            createdAt: openWebsite.website.createdAt.toISOString(),
            options: openWebsite.website.options,
            pages: openWebsite.pages.map((page) => ({
              id: page.id,
              url: page.url,
              title: page.title,
              lastModified: page.lastModified,
              status: page.status,
              error: page.error,
              documentId: page.documentId,
            })),
          }}
          initialTab={WEBSITE_TABS.find((t) => t === tab) ?? "informacion"}
        />
      )}
    </PageContainer>
  );
}
