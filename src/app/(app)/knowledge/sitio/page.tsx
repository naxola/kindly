import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { requireCurrentOrganizationMember } from "@/modules/organizations/service";
import { discoverPages, normalizePageUrl } from "@/modules/knowledge/ingestion/site-discovery";
import { assertPublicHost } from "@/modules/knowledge/ingestion/network-guard";
import { validateWebUrl } from "@/modules/knowledge/ingestion/upload-validation";
import { existingSourceUrls } from "@/modules/knowledge/site-import";
import { SelectPagesForm, type CandidatePage } from "@/app/(app)/knowledge/sitio/select-pages-form";
import { PageContainer } from "@/components/patterns/page-container";
import { PageHeader } from "@/components/patterns/page-header";
import { PageSection } from "@/components/patterns/page-section";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { pageTitle } from "@/lib/page-title";

// Finding the pages downloads the sitemap/feed in the request, and the import
// started from this page's Server Action runs its first slice after the response.
export const maxDuration = 60;

export async function generateMetadata(): Promise<Metadata> {
  const member = await requireCurrentOrganizationMember();
  return { title: pageTitle("Añadir páginas de un sitio web", member.organizationName) };
}

type Outcome =
  | { kind: "none" }
  | { kind: "error"; message: string }
  | { kind: "empty" }
  | { kind: "pages"; siteUrl: string; pages: CandidatePage[]; truncated: boolean; source: "sitemap" | "feed" };

async function find(organizationId: string, raw: string): Promise<Outcome> {
  const valid = validateWebUrl(raw);
  if (!valid.ok) return { kind: "error", message: valid.error };
  try {
    await assertPublicHost(new URL(valid.value));
  } catch {
    return { kind: "error", message: "La dirección no es pública o no se puede resolver." };
  }

  const [result, known] = await Promise.all([discoverPages(valid.value), existingSourceUrls(organizationId)]);
  if (result.pages.length === 0) return { kind: "empty" };
  return {
    kind: "pages",
    siteUrl: valid.value,
    source: result.source === "feed" ? "feed" : "sitemap",
    truncated: result.truncated,
    pages: result.pages.map((page) => ({
      url: page.url,
      title: page.title,
      lastModified: page.lastModified,
      existingDocumentId: known.get(normalizePageUrl(page.url)) ?? null,
    })),
  };
}

export default async function SitePagesPage({ searchParams }: { searchParams: Promise<{ url?: string }> }) {
  const member = await requireCurrentOrganizationMember();
  if (member.role !== "ADMIN") notFound();

  const { url } = await searchParams;
  const raw = url?.trim() ?? "";
  const outcome: Outcome = raw ? await find(member.organizationId, raw) : { kind: "none" };

  return (
    <PageContainer>
      <PageHeader
        title="Añadir páginas de un sitio web"
        description="Busca las páginas del sitio y elige cuáles indexar"
        aside={
          <Link href="/knowledge" className="focus-ring type-body rounded-sm text-foreground-lighter underline">
            Volver a Conocimiento
          </Link>
        }
      />

      <PageSection title="Sitio" description="Usa el sitemap del sitio o, si no tiene, su feed RSS. Solo se guarda el texto de cada página">
        <form method="get" role="search" aria-label="Buscar páginas del sitio" className="flex max-w-page-sm flex-col gap-4">
          <Field label="Dirección del sitio" description="Puede ser la portada o una sección, por ejemplo https://ejemplo.org/blog.">
            <Input type="url" name="url" defaultValue={raw} required placeholder="https://" />
          </Field>
          <div>
            <Button type="submit" variant="primary">
              Buscar páginas
            </Button>
          </div>
        </form>
      </PageSection>

      {outcome.kind === "error" && (
        <Alert tone="destructive" title="No se pudo leer el sitio">
          {outcome.message}
        </Alert>
      )}
      {outcome.kind === "empty" && (
        <Alert tone="warning" title="No se han encontrado páginas">
          El sitio no publica un sitemap ni un feed RSS que podamos leer, o el robots.txt los excluye. Puedes añadir las
          páginas una a una desde «Añadir conocimiento».
        </Alert>
      )}
      {outcome.kind === "pages" && (
        <PageSection
          title="Páginas encontradas"
          description={`${outcome.pages.length} ${outcome.pages.length === 1 ? "página" : "páginas"} según el ${outcome.source === "feed" ? "feed RSS" : "sitemap"}`}
        >
          <SelectPagesForm siteUrl={outcome.siteUrl} pages={outcome.pages} truncated={outcome.truncated} />
        </PageSection>
      )}
    </PageContainer>
  );
}
