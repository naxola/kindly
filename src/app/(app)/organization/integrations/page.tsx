import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { requireCurrentOrganizationMember } from "@/modules/organizations/service";
import { authBaseOrigin } from "@/modules/auth/trusted-origins";
import { listIntegrationKeys } from "@/modules/affiliates/integration-keys";
import { IntegrationKeys } from "@/app/(app)/organization/integrations/integration-keys";
import { OrganizationContextNav } from "@/app/(app)/organization/organization-context-nav";
import { PageContainer } from "@/components/patterns/page-container";
import { PageHeader } from "@/components/patterns/page-header";
import { PageSection } from "@/components/patterns/page-section";
import { pageTitle } from "@/lib/page-title";

export async function generateMetadata(): Promise<Metadata> {
  const member = await requireCurrentOrganizationMember();
  return { title: pageTitle("Integraciones", member.organizationName) };
}

/**
 * `/organization/integrations` — the key an external automation (n8n) uses to
 * send altas to Kindly, and the endpoint it posts to. ADMIN only.
 */
export default async function IntegrationsPage() {
  const member = await requireCurrentOrganizationMember();
  if (member.role !== "ADMIN") notFound();

  const keys = await listIntegrationKeys(member.organizationId);
  // Origin only: BETTER_AUTH_URL may carry a pasted path such as /login.
  const baseUrl = authBaseOrigin() ?? "";

  return (
    <PageContainer size="sm">
      <PageHeader title="Integraciones" description="Conecta una automatización externa para que envíe altas de afiliados a Kindly" />
      <OrganizationContextNav />

      <PageSection
        title="Altas de afiliados"
        description="Tu automatización envía cada alta a este endpoint con una clave. Las altas llegan a «Altas», donde confirmas el delegado"
      >
        <IntegrationKeys
          endpoint={`${baseUrl}/api/integrations/affiliate-requests`}
          keys={keys.map((key) => ({
            id: key.id,
            name: key.name,
            keyPrefix: key.keyPrefix,
            createdAt: key.createdAt.toISOString(),
            lastUsedAt: key.lastUsedAt?.toISOString() ?? null,
            revokedAt: key.revokedAt?.toISOString() ?? null,
          }))}
        />
      </PageSection>
    </PageContainer>
  );
}
