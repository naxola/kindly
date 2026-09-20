import Link from "next/link";
import { notFound } from "next/navigation";
import { requireCurrentOrganizationMember } from "@/modules/organizations/service";
import { getChannelCapabilities } from "@/modules/messaging/registry";
import { ONBOARDING_PATHS } from "@/modules/messaging/whatsapp-onboarding";

/**
 * Step 1 of the WhatsApp coexistence onboarding (PKG-008): choosing one of
 * the three mutually exclusive ways in.
 *
 * Reached only for channels whose adapter declares
 * `onboarding: "WHATSAPP_COEXISTENCE"` — the route knows nothing about
 * which provider that is (`CLAUDE.md` sección 2).
 */
export default async function ConnectChannelPage({ params }: { params: Promise<{ channel: string }> }) {
  const { channel } = await params;
  await requireCurrentOrganizationMember();

  const capabilities = getChannelCapabilities(channel);
  if (!capabilities || capabilities.onboarding !== "WHATSAPP_COEXISTENCE") {
    // No adapter, or a channel that connects in one click and has no flow
    // to walk through.
    notFound();
  }

  return (
    <div className="flex flex-col gap-6">
      <div>
        <Link href="/channels" className="text-sm text-zinc-500 underline">
          ← Mis canales
        </Link>
        <h1 className="text-xl font-semibold">Conectar WhatsApp</h1>
        <p className="text-sm text-zinc-500">
          Elige cómo quieres conectar. Solo puedes seguir una de las tres vías, y no se puede cambiar después sin
          desconectar.
        </p>
      </div>

      <ul className="flex flex-col gap-3">
        {ONBOARDING_PATHS.map((path) => (
          <li
            key={path.id}
            className={`rounded border p-4 ${
              path.available ? "border-zinc-200" : "border-zinc-200 bg-zinc-50 text-zinc-500"
            }`}
          >
            <p className="text-sm font-medium">{path.title}</p>
            <p className="mt-1 text-sm">{path.description}</p>
            {path.available ? (
              <Link
                href={`/channels/connect/${channel}/coexistence`}
                className="mt-3 inline-block rounded bg-zinc-900 px-3 py-1.5 text-sm font-medium text-white"
              >
                Siguiente
              </Link>
            ) : (
              <p className="mt-3 text-xs">
                <span className="font-medium">No disponible todavía.</span> {path.unavailableReason}
              </p>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}
