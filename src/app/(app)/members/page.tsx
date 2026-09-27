import type { Metadata } from "next";
import { requireCurrentOrganizationMember, listOrganizationMembers } from "@/modules/organizations/service";
import { listInvitations } from "@/modules/organizations/invitations";
import { NewMemberDialog } from "@/app/(app)/members/new-member-dialog";
import { RevokeInvitationButton } from "@/app/(app)/members/revoke-invitation-button";
import { PageContainer } from "@/components/patterns/page-container";
import { PageHeader } from "@/components/patterns/page-header";
import { PageSection } from "@/components/patterns/page-section";
import { EmptyState } from "@/components/ui/empty-state";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { pageTitle } from "@/lib/page-title";

export async function generateMetadata(): Promise<Metadata> {
  const member = await requireCurrentOrganizationMember();
  return { title: pageTitle("Miembros", member.organizationName) };
}

/**
 * Organization members and pending invitations (PKG-006).
 *
 * Kindly does not send email yet, so an invitation is a link the ADMIN
 * copies and passes on by whatever means they already use. That is a real
 * limitation, shown as such rather than hidden behind a "Sent!" toast that
 * would be a lie (see docs/DECISIONS.md).
 */
export default async function MembersPage() {
  const member = await requireCurrentOrganizationMember();
  const isAdmin = member.role === "ADMIN";

  const [members, invitations] = await Promise.all([
    listOrganizationMembers(member.organizationId),
    listInvitations(member.organizationId),
  ]);

  const pending = invitations.filter((invitation) => invitation.status === "PENDING");
  const baseUrl = process.env.BETTER_AUTH_URL ?? "";

  return (
    <PageContainer>
      <PageHeader
        title="Miembros"
        description="Un ADMIN gestiona la organización; un DELEGATE atiende sus propias conversaciones. Cada persona pertenece a una sola organización"
        aside={isAdmin && <NewMemberDialog />}
      />

      <PageSection title="En la organización">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Nombre</TableHead>
              <TableHead>Email</TableHead>
              <TableHead>Rol</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {members.map((row) => (
              <TableRow key={row.userId}>
                <TableCell className="font-medium text-foreground">
                  {row.name}
                  {row.userId === member.userId && <span className="font-normal text-foreground-lighter"> (tú)</span>}
                </TableCell>
                <TableCell className="text-foreground-lighter">{row.email}</TableCell>
                <TableCell className="text-foreground-lighter">{row.role}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </PageSection>

      {isAdmin && (
        <PageSection title="Invitaciones pendientes">
          {pending.length === 0 ? (
            <EmptyState variant="inline" title="No hay invitaciones pendientes." />
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Email</TableHead>
                  <TableHead>Rol</TableHead>
                  <TableHead>Enlace</TableHead>
                  <TableHead>Caduca</TableHead>
                  <TableHead>
                    <span className="sr-only">Acciones</span>
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {pending.map((invitation) => (
                  <TableRow key={invitation.id}>
                    <TableCell className="text-foreground">{invitation.email}</TableCell>
                    <TableCell className="text-foreground-lighter">{invitation.role}</TableCell>
                    <TableCell>
                      <code className="break-all font-mono type-caption text-foreground-lighter">
                        {baseUrl}/invite/{invitation.token}
                      </code>
                    </TableCell>
                    <TableCell className="text-foreground-lighter">
                      {invitation.expiresAt.toLocaleDateString("es-ES")}
                    </TableCell>
                    <TableCell className="text-right">
                      <RevokeInvitationButton invitationId={invitation.id} email={invitation.email} />
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </PageSection>
      )}
    </PageContainer>
  );
}
