import type { Metadata } from "next";
import { requireCurrentOrganizationMember, listOrganizationMembers } from "@/modules/organizations/service";
import { authBaseOrigin } from "@/modules/auth/trusted-origins";
import { listInvitations } from "@/modules/organizations/invitations";
import { ChangeRoleControl } from "@/app/(app)/organization/members/change-role-control";
import { MemberPhoneControl } from "@/app/(app)/organization/members/member-phone-control";
import { NewMemberDialog } from "@/app/(app)/organization/members/new-member-dialog";
import { ResendInvitationButton } from "@/app/(app)/organization/members/resend-invitation-button";
import { RevokeInvitationButton } from "@/app/(app)/organization/members/revoke-invitation-button";
import { OrganizationContextNav } from "@/app/(app)/organization/organization-context-nav";
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
 * Inviting emails the link to the invitee. If the send fails (e.g. Resend
 * without a verified domain only delivers to the account owner) the
 * invitation still exists and the link below is the fallback the ADMIN
 * passes on by hand; the UI says so instead of claiming "sent"
 * (see docs/DECISIONS.md).
 */
export default async function MembersPage() {
  const member = await requireCurrentOrganizationMember();
  const isAdmin = member.role === "ADMIN";

  const [members, invitations] = await Promise.all([
    listOrganizationMembers(member.organizationId),
    listInvitations(member.organizationId),
  ]);

  const pending = invitations.filter((invitation) => invitation.status === "PENDING");
  const baseUrl = authBaseOrigin() ?? "";

  return (
    <PageContainer>
      <PageHeader
        title="Miembros"
        description="Un ADMIN gestiona la organización; un DELEGATE atiende sus propias conversaciones. Cada persona pertenece a una sola organización"
        aside={isAdmin && <NewMemberDialog />}
      />
      <OrganizationContextNav />

      <PageSection title="En la organización">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Nombre</TableHead>
              <TableHead>Email</TableHead>
              <TableHead>Teléfono</TableHead>
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
                <TableCell className="text-foreground-lighter">
                  {isAdmin || row.userId === member.userId ? (
                    <MemberPhoneControl userId={row.userId} memberName={row.name} currentPhone={row.phoneE164} />
                  ) : (
                    row.phoneE164 ?? "—"
                  )}
                </TableCell>
                <TableCell className="text-foreground-lighter">
                  {isAdmin ? (
                    <ChangeRoleControl userId={row.userId} memberName={row.name} currentRole={row.role} />
                  ) : (
                    row.role
                  )}
                </TableCell>
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
                      <ResendInvitationButton invitationId={invitation.id} email={invitation.email} />
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
