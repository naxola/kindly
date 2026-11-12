import Link from "next/link";
import { notFound } from "next/navigation";
import { requireCurrentOrganizationMember } from "@/modules/organizations/service";
import { getChannelCapabilities } from "@/modules/messaging/registry";
import {
  PREFLIGHT_CHECKS,
  getUnsupportedCountryCodes,
} from "@/modules/messaging/whatsapp-onboarding";
import { CoexistencePreflightForm } from "@/app/(app)/organization/channels/connect/[channel]/coexistence/preflight-form";
import { PageContainer } from "@/components/patterns/page-container";
import { PageHeader } from "@/components/patterns/page-header";
import { Alert } from "@/components/ui/alert";

/**
 * Step 2 (PKG-008): everything the delegate has to know *before* the
 * connection starts, because afterwards some of it is irreversible from
 * Kindly's side.
 *
 * The country check is data, not a hardcoded list: see
 * `checkCountrySupport` for why an unconfirmed list would be worse than
 * none.
 */
export default async function CoexistencePreflightPage({
  params,
  searchParams,
}: {
  params: Promise<{ channel: string }>;
  searchParams: Promise<{ error?: string }>;
}) {
  const { channel } = await params;
  const { error } = await searchParams;
  await requireCurrentOrganizationMember();

  const capabilities = getChannelCapabilities(channel);
  if (!capabilities || capabilities.onboarding !== "WHATSAPP_COEXISTENCE") {
    notFound();
  }

  const unsupportedCountryCodes = getUnsupportedCountryCodes();

  return (
    <PageContainer size="sm">
      <div className="flex flex-col gap-2">
        <Link
          href={`/organization/channels/connect/${channel}`}
          className="w-fit type-body text-foreground-lighter underline focus-ring rounded-sm"
        >
          ← Elegir otra vía
        </Link>
        <PageHeader
          title="Antes de conectar tu número"
          description="Esto no son condiciones de Kindly: cada punto es un requisito de Meta o una consecuencia real para el móvil que llevas encima. Confírmalos todos para continuar"
        />
      </div>

      {error && (
        <Alert tone="destructive" live title="No se pudo conectar el canal">
          {error}
        </Alert>
      )}

      <CoexistencePreflightForm
        channel={channel}
        checks={PREFLIGHT_CHECKS}
        countryCheckAvailable={unsupportedCountryCodes.length > 0}
      />
    </PageContainer>
  );
}
