import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { requireCurrentOrganizationMember } from "@/modules/organizations/service";
import { getImportBatch } from "@/modules/knowledge/site-import";
import { summarizeImport } from "@/modules/knowledge/source-status";
import { ImportProgress } from "@/app/(app)/knowledge/sitio/[batchId]/import-progress";
import { IMPORT_STATUS_LABELS, IMPORT_STATUS_TONES } from "@/app/(app)/knowledge/labels";
import { PageContainer } from "@/components/patterns/page-container";
import { PageHeader } from "@/components/patterns/page-header";
import { PageSection } from "@/components/patterns/page-section";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { pageTitle } from "@/lib/page-title";

// The progress page drives the import slices through a Server Action (Vercel limit).
export const maxDuration = 60;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function generateMetadata(): Promise<Metadata> {
  const member = await requireCurrentOrganizationMember();
  return { title: pageTitle("Importación de páginas", member.organizationName) };
}

function shortAddress(url: string): string {
  const { hostname, pathname, search } = new URL(url);
  return `${hostname}${pathname === "/" ? "" : pathname}${search}`;
}

export default async function ImportBatchPage({ params }: { params: Promise<{ batchId: string }> }) {
  const member = await requireCurrentOrganizationMember();
  const { batchId } = await params;
  if (member.role !== "ADMIN" || !UUID.test(batchId)) notFound();

  const pages = await getImportBatch(member.organizationId, batchId);
  if (pages.length === 0) notFound();
  const summary = summarizeImport(pages);

  return (
    <PageContainer>
      <PageHeader
        title="Importación de páginas"
        description={shortAddress(pages[0].siteUrl)}
        aside={
          <Link href="/knowledge" className="focus-ring type-body rounded-sm text-foreground-lighter underline">
            Volver a Conocimiento
          </Link>
        }
      />

      <PageSection
        title="Progreso"
        description={`${summary.indexed} indexadas · ${summary.failed} con error · ${summary.skipped} omitidas · ${summary.pending + summary.indexing} pendientes`}
      >
        <ImportProgress batchId={batchId} waiting={summary.pending + summary.indexing} failed={summary.failed} total={summary.total} />

        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Página</TableHead>
              <TableHead>Estado</TableHead>
              <TableHead>Detalle</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {pages.map((page) => (
              <TableRow key={page.id}>
                <TableCell>
                  <div className="font-medium text-foreground">
                    {page.documentId ? (
                      <Link href={`/knowledge/${page.documentId}`} className="focus-ring rounded-sm">
                        {page.title ?? shortAddress(page.url)}
                      </Link>
                    ) : (
                      (page.title ?? shortAddress(page.url))
                    )}
                  </div>
                  <div className="type-body text-foreground-lighter">{shortAddress(page.url)}</div>
                </TableCell>
                <TableCell>
                  <Badge tone={IMPORT_STATUS_TONES[page.status]}>{IMPORT_STATUS_LABELS[page.status]}</Badge>
                </TableCell>
                <TableCell className="text-foreground-lighter">{page.error ?? "—"}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </PageSection>
    </PageContainer>
  );
}
