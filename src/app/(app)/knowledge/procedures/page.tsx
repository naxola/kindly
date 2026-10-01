import type { Metadata } from "next";
import Link from "next/link";
import { requireCurrentOrganizationMember } from "@/modules/organizations/service";
import { listProcedures } from "@/modules/procedures/service";
import { NewProcedureSheet } from "@/app/(app)/knowledge/procedures/new-procedure-sheet";
import { PageContainer } from "@/components/patterns/page-container";
import { PageHeader } from "@/components/patterns/page-header";
import { Table, TableBody, TableCell, TableEmpty, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { pageTitle } from "@/lib/page-title";

export async function generateMetadata(): Promise<Metadata> {
  const member = await requireCurrentOrganizationMember();
  return { title: pageTitle("Trámites", "Conocimiento", member.organizationName) };
}

export default async function ProceduresPage() {
  const member = await requireCurrentOrganizationMember();
  const procedures = await listProcedures(member.organizationId);

  return (
    <PageContainer>
      <PageHeader
        title="Trámites"
        description="Pasos y documentos requeridos de cada trámite de la organización"
        aside={member.role === "ADMIN" ? <NewProcedureSheet /> : undefined}
      />

      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Nombre</TableHead>
            <TableHead>Descripción</TableHead>
            <TableHead>Versión vigente</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {procedures.map((procedure) => (
            <TableRow key={procedure.id}>
              <TableCell className="font-medium text-foreground">
                <Link href={`/knowledge/procedures/${procedure.id}`} className="focus-ring rounded-sm">
                  {procedure.name}
                </Link>
              </TableCell>
              <TableCell className="text-foreground-lighter">{procedure.description ?? "—"}</TableCell>
              <TableCell className="text-foreground-lighter">{procedure.currentVersion ?? "—"}</TableCell>
            </TableRow>
          ))}
          {procedures.length === 0 && (
            <TableEmpty
              colSpan={3}
              title="Todavía no hay trámites"
              description={
                member.role === "ADMIN"
                  ? "Crea el primero para saber qué documentación falta en cada caso."
                  : "Un administrador puede crearlos."
              }
            />
          )}
        </TableBody>
      </Table>
    </PageContainer>
  );
}
