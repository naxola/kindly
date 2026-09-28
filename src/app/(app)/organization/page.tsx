import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { requireCurrentOrganizationMember, getOrganization, listOrganizationMembers } from "@/modules/organizations/service";
import { listInvitations } from "@/modules/organizations/invitations";
import { listMessagingAccountsForMember } from "@/modules/messaging/service";
import { describeAccountStatus } from "@/modules/messaging/domain";
import { renameOrganizationAction } from "@/modules/organizations/actions";
import { OrganizationContextNav } from "@/app/(app)/organization/organization-context-nav";
import { PageContainer } from "@/components/patterns/page-container";
import { PageHeader } from "@/components/patterns/page-header";
import { PageSection } from "@/components/patterns/page-section";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { SubmitButton } from "@/components/ui/submit-button";
import { pageTitle } from "@/lib/page-title";

export async function generateMetadata(): Promise<Metadata> {
  const member = await requireCurrentOrganizationMember();
  return { title: pageTitle("Organización", member.organizationName) };
}

/**
 * `/organization` — General (UI-7, `docs/ui/ORGANIZATION.md` §3). Everyone
 * sees it; only an ADMIN can rename the organization. The summary counts
 * reuse each module's own visibility rule instead of a fresh query: a
 * DELEGATE's channel count is their own (`listMessagingAccountsForMember`
 * already scopes that way, PKG-007), never the whole organization's.
 */
export default async function OrganizationPage() {
  const member = await requireCurrentOrganizationMember();
  const isAdmin = member.role === "ADMIN";

  const organization = await getOrganization(member.organizationId);
  if (!organization) {
    notFound();
  }

  const [members, accounts, invitations] = await Promise.all([
    listOrganizationMembers(member.organizationId),
    listMessagingAccountsForMember(member.organizationId, member),
    isAdmin ? listInvitations(member.organizationId) : Promise.resolve([]),
  ]);

  const connectedAccounts = accounts.filter((account) => account.status !== "DISCONNECTED");
  const accountsNeedingAttention = accounts.filter((account) => describeAccountStatus(account.status).needsAttention);
  const pendingInvitations = invitations.filter((invitation) => invitation.status === "PENDING");

  return (
    <PageContainer size="sm">
      <PageHeader
        title={organization.name}
        description={`Creada el ${organization.createdAt.toLocaleDateString("es-ES")} · Tu rol: ${member.role}`}
      />
      <OrganizationContextNav />

      {isAdmin && (
        <PageSection title="Nombre">
          <form action={renameOrganizationAction} className="flex flex-wrap items-end gap-3">
            <Field label="Nombre de la organización" className="min-w-64 flex-1">
              <Input name="name" defaultValue={organization.name} required />
            </Field>
            <SubmitButton>Guardar</SubmitButton>
          </form>
        </PageSection>
      )}

      <PageSection title="Resumen">
        <ul className="flex flex-col gap-2">
          <SummaryLink
            href="/organization/members"
            label="Miembros"
            detail={`${members.length} ${members.length === 1 ? "persona" : "personas"}`}
          />
          <SummaryLink
            href="/organization/channels"
            label="Canales"
            detail={
              accountsNeedingAttention.length > 0
                ? `${connectedAccounts.length} conectados · ${accountsNeedingAttention.length} con incidencias`
                : `${connectedAccounts.length} conectados`
            }
          />
          {isAdmin && (
            <SummaryLink
              href="/organization/members"
              label="Invitaciones pendientes"
              detail={`${pendingInvitations.length}`}
            />
          )}
        </ul>
      </PageSection>
    </PageContainer>
  );
}

function SummaryLink({ href, label, detail }: { href: string; label: string; detail: string }) {
  return (
    <li>
      <Link
        href={href}
        className="flex items-center justify-between gap-4 rounded-card border border-border px-4 py-3 type-body hover:bg-state-hover focus-ring"
      >
        <span className="text-foreground">{label}</span>
        <span className="text-foreground-lighter">{detail}</span>
      </Link>
    </li>
  );
}
