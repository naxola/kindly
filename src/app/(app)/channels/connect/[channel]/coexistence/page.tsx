import Link from "next/link";
import { notFound } from "next/navigation";
import { requireCurrentOrganizationMember } from "@/modules/organizations/service";
import { getChannelCapabilities } from "@/modules/messaging/registry";
import {
  PREFLIGHT_CHECKS,
  getUnsupportedCountryCodes,
} from "@/modules/messaging/whatsapp-onboarding";
import { CoexistencePreflightForm } from "@/app/(app)/channels/connect/[channel]/coexistence/preflight-form";

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
    <div className="flex flex-col gap-6">
      <div>
        <Link href={`/channels/connect/${channel}`} className="text-sm text-zinc-500 underline">
          ← Elegir otra vía
        </Link>
        <h1 className="text-xl font-semibold">Antes de conectar tu número</h1>
        <p className="text-sm text-zinc-500">
          Esto no son condiciones de Kindly: cada punto es un requisito de Meta o una consecuencia real para el
          móvil que llevas encima. Confírmalos todos para continuar.
        </p>
      </div>

      {error && (
        <div className="rounded border border-red-200 bg-red-50 p-3 text-sm text-red-900">
          <p className="font-medium">No se pudo conectar el canal</p>
          <p>{error}</p>
        </div>
      )}

      <CoexistencePreflightForm
        channel={channel}
        checks={PREFLIGHT_CHECKS}
        countryCheckAvailable={unsupportedCountryCodes.length > 0}
      />
    </div>
  );
}
