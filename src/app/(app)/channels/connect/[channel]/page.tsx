import Link from "next/link";
import { notFound } from "next/navigation";
import { requireCurrentOrganizationMember } from "@/modules/organizations/service";
import { getChannelCapabilities } from "@/modules/messaging/registry";
import { ONBOARDING_PATHS } from "@/modules/messaging/whatsapp-onboarding";
import { PageContainer } from "@/components/patterns/page-container";
import { PageHeader } from "@/components/patterns/page-header";
import { buttonVariants } from "@/components/ui/button-variants";
import { Card } from "@/components/ui/card";

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
    <PageContainer size="sm">
      <div className="flex flex-col gap-2">
        <Link href="/channels" className="w-fit type-body text-foreground-lighter underline focus-ring rounded-sm">
          ← Mis canales
        </Link>
        <PageHeader
          title="Conectar WhatsApp"
          description="Elige cómo quieres conectar. Solo puedes seguir una de las tres vías, y no se puede cambiar después sin desconectar"
        />
      </div>

      <ul className="flex flex-col gap-3">
        {ONBOARDING_PATHS.map((path) => (
          <li key={path.id}>
            <Card className={path.available ? "p-4" : "bg-background-muted p-4 text-foreground-lighter"}>
              <p className="type-label text-foreground">{path.title}</p>
              <p className="mt-1 type-body">{path.description}</p>
              {path.available ? (
                <Link
                  href={`/channels/connect/${channel}/coexistence`}
                  className={`mt-3 inline-flex ${buttonVariants({ variant: "primary" })}`}
                >
                  Siguiente
                </Link>
              ) : (
                <p className="mt-3 type-caption">
                  <span className="font-medium">No disponible todavía.</span> {path.unavailableReason}
                </p>
              )}
            </Card>
          </li>
        ))}
      </ul>
    </PageContainer>
  );
}
