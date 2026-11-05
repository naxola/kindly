import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { UserPlus } from "lucide-react";
import { requireCurrentOrganizationMember } from "@/modules/organizations/service";
import { getDelegateLoads, listOpenRequests } from "@/modules/affiliates/requests";
import { PendingRow } from "@/app/(app)/affiliate-requests/pending-row";
import { DuplicateRow } from "@/app/(app)/affiliate-requests/duplicate-row";
import { ConfirmAllButton } from "@/app/(app)/affiliate-requests/confirm-all-button";
import { PageContainer } from "@/components/patterns/page-container";
import { PageHeader } from "@/components/patterns/page-header";
import { PageSection } from "@/components/patterns/page-section";
import { Alert } from "@/components/ui/alert";
import { EmptyState } from "@/components/ui/empty-state";
import { Table, TableBody, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { pageTitle } from "@/lib/page-title";

export async function generateMetadata(): Promise<Metadata> {
  const member = await requireCurrentOrganizationMember();
  return { title: pageTitle("Altas", member.organizationName) };
}

/**
 * Altas received from the external automation, waiting for the ADMIN
 * (docs/DECISIONS.md, "Altas de afiliados por webhook"). The proposal is
 * the delegate with the fewest affiliates; the admin sees everyone's load
 * and decides. ADMIN only — a DELEGATE gets a 404, like any page that does
 * not exist for them.
 */
export default async function AffiliateRequestsPage() {
  const member = await requireCurrentOrganizationMember();
  if (member.role !== "ADMIN") notFound();

  const [requests, delegates] = await Promise.all([listOpenRequests(member.organizationId), getDelegateLoads(member.organizationId)]);
  const pending = requests.filter((request) => request.status === "PENDING");
  const duplicates = requests.filter((request) => request.status === "DUPLICATE");
  const delegateNames = new Map(delegates.map((delegate) => [delegate.userId, delegate.name]));
  const confirmable = pending.filter((request) => request.proposedDelegateId).length;

  return (
    <PageContainer>
      <PageHeader
        title="Altas"
        description="Afiliados recibidos por el webhook. Hasta que confirmes la asignación, solo los administradores los ven"
        aside={confirmable > 1 && <ConfirmAllButton count={confirmable} />}
      />

      {delegates.length === 0 && (
        <Alert tone="warning" title="No hay delegados en la organización">
          Invita al menos a un delegado en Organización → Miembros para poder asignar las altas.
        </Alert>
      )}

      {requests.length === 0 ? (
        <EmptyState
          icon={<UserPlus />}
          title="No hay altas pendientes"
          description="Cuando tu automatización envíe una nueva alta aparecerá aquí con el delegado propuesto."
        />
      ) : (
        <>
          <PageSection title="Pendientes de asignar" description="Se propone al delegado con menos afiliados">
            {pending.length === 0 ? (
              <p className="type-body text-foreground-lighter">Ninguna por ahora.</p>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Afiliado</TableHead>
                    <TableHead>Centro de trabajo</TableHead>
                    <TableHead>Recibida</TableHead>
                    <TableHead>Propuesta</TableHead>
                    <TableHead>
                      <span className="sr-only">Acciones</span>
                    </TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {pending.map((request) => (
                    <PendingRow
                      key={request.id}
                      request={{ ...request, receivedAt: request.receivedAt.toISOString() }}
                      delegates={delegates}
                      proposedName={request.proposedDelegateId ? (delegateNames.get(request.proposedDelegateId) ?? null) : null}
                    />
                  ))}
                </TableBody>
              </Table>
            )}
          </PageSection>

          {duplicates.length > 0 && (
            <PageSection
              title="Posibles duplicados"
              description="Ese DNI ya es un afiliado de la organización: decide si actualizar sus datos o descartar el alta"
            >
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Alta recibida</TableHead>
                    <TableHead>Afiliado existente</TableHead>
                    <TableHead>Recibida</TableHead>
                    <TableHead>
                      <span className="sr-only">Acciones</span>
                    </TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {duplicates.map((request) => (
                    <DuplicateRow key={request.id} request={{ ...request, receivedAt: request.receivedAt.toISOString() }} />
                  ))}
                </TableBody>
              </Table>
            </PageSection>
          )}
        </>
      )}
    </PageContainer>
  );
}
