import type { Metadata } from "next";
import Link from "next/link";
import { requireCurrentOrganizationMember, listOrganizationMembers } from "@/modules/organizations/service";
import { listMessagingAccountsForMember } from "@/modules/messaging/service";
import { channelHasWebhookHandshake, getChannelCapabilities, listRegisteredChannels } from "@/modules/messaging/registry";
import { describeAccountStatus, type AccountStatusTone } from "@/modules/messaging/domain";
import { connectMessagingAccountAction } from "@/modules/messaging/actions";
import type { MessagingAccountStatus } from "@/modules/messaging/schema";
import { DisconnectChannelButton } from "@/app/(app)/channels/disconnect-channel-button";
import { PageContainer } from "@/components/patterns/page-container";
import { PageHeader } from "@/components/patterns/page-header";
import { PageSection } from "@/components/patterns/page-section";
import { Alert } from "@/components/ui/alert";
import { Badge, type BadgeProps } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button-variants";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { SubmitButton } from "@/components/ui/submit-button";
import { pageTitle } from "@/lib/page-title";

export async function generateMetadata(): Promise<Metadata> {
  const member = await requireCurrentOrganizationMember();
  return { title: pageTitle("Canales", member.organizationName) };
}

/**
 * Channel settings (PKG-007). A DELEGATE manages their own communication
 * identity here; an ADMIN additionally sees the whole organization's
 * connections, because knowing that a colleague's channel is broken is part
 * of running it.
 *
 * Connecting is always for oneself: every real provider authenticates the
 * account holder in person (a Telegram Business bot is added from inside
 * the delegate's own Telegram, WhatsApp's Embedded Signup runs against
 * their own Meta login), so the "connect on behalf of" picker this page had
 * through PKG-006 could only ever have been theatre.
 */
export default async function ChannelsPage({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const { error } = await searchParams;
  const member = await requireCurrentOrganizationMember();
  const [accounts, members] = await Promise.all([
    listMessagingAccountsForMember(member.organizationId, member),
    listOrganizationMembers(member.organizationId),
  ]);

  const availableChannels = listRegisteredChannels();
  const memberNameById = new Map(members.map((m) => [m.userId, m.name]));
  const myAccounts = accounts.filter((account) => account.delegateId === member.userId);
  const otherAccounts = accounts.filter((account) => account.delegateId !== member.userId);
  const myConnectedChannels = new Set(
    myAccounts.filter((account) => account.status !== "DISCONNECTED").map((account) => account.channel),
  );

  return (
    <PageContainer>
      <PageHeader
        title="Mis canales"
        description="Cada profesional conecta su propia cuenta de WhatsApp o Telegram. Kindly sincroniza esa conversación, no la sustituye ni la centraliza en un número de la organización"
      />

      {error && (
        <Alert tone="destructive" live title="No se pudo conectar el canal">
          {error}
        </Alert>
      )}

      <PageSection title="Conectados a tu nombre">
        {myAccounts.length === 0 ? (
          <EmptyState variant="inline" title="Todavía no has conectado ningún canal." />
        ) : (
          <ul className="flex flex-col gap-3" aria-label="Canales conectados a tu nombre">
            {myAccounts.map((account) => (
              <AccountCard
                key={account.id}
                account={account}
                canDisconnect={getChannelCapabilities(account.channel)?.canDisconnect ?? false}
                showWebhookPath={account.status !== "DISCONNECTED" && channelHasWebhookHandshake(account.channel)}
                isOwn
              />
            ))}
          </ul>
        )}
      </PageSection>

      <PageSection title="Conectar un canal">
        {availableChannels.length === 0 ? (
          <p className="type-body text-foreground-lighter">
            No hay ningún proveedor de mensajería disponible todavía. WhatsApp y Telegram llegan en fases futuras
            (ver project/TASKS.md).
          </p>
        ) : (
          <ul className="flex flex-col gap-2">
            {availableChannels.map((channel) => {
              const alreadyConnected = myConnectedChannels.has(channel);
              // A channel whose provider demands an onboarding (WhatsApp
              // coexistence) cannot be connected from a button: the
              // delegate has to choose a path and acknowledge what it does
              // to their phone first (PKG-008).
              const needsOnboarding = getChannelCapabilities(channel)?.onboarding !== "DIRECT";
              return (
                <li key={channel} className="flex items-center justify-between rounded-card border border-border px-4 py-3">
                  <div>
                    <p className="type-label text-foreground">{channel}</p>
                    <p className="type-caption text-foreground-lighter">
                      {alreadyConnected
                        ? "Ya tienes una cuenta conectada en este canal."
                        : "Se conectará con tu propia cuenta, a tu nombre."}
                    </p>
                  </div>
                  {!alreadyConnected &&
                    (needsOnboarding ? (
                      <Link href={`/channels/connect/${channel}`} className={buttonVariants({ variant: "primary" })}>
                        Conectar {channel}
                      </Link>
                    ) : (
                      <form action={connectMessagingAccountAction}>
                        <input type="hidden" name="channel" value={channel} />
                        <SubmitButton>Conectar {channel}</SubmitButton>
                      </form>
                    ))}
                </li>
              );
            })}
          </ul>
        )}
      </PageSection>

      {member.role === "ADMIN" && (
        <PageSection title="Canales del resto de la organización">
          {otherAccounts.length === 0 ? (
            <EmptyState variant="inline" title="Ningún otro miembro ha conectado un canal todavía." />
          ) : (
            <ul className="flex flex-col gap-3" aria-label="Canales del resto de la organización">
              {otherAccounts.map((account) => (
                <AccountCard
                  key={account.id}
                  account={account}
                  canDisconnect={getChannelCapabilities(account.channel)?.canDisconnect ?? false}
                  delegateName={memberNameById.get(account.delegateId) ?? "—"}
                />
              ))}
            </ul>
          )}
        </PageSection>
      )}
    </PageContainer>
  );
}

const STATUS_COPY: Record<MessagingAccountStatus, { label: string; detail: string }> = {
  PENDING: {
    label: "Pendiente",
    detail: "La conexión está iniciada pero aún no autorizada. Termina el proceso con el proveedor.",
  },
  CONNECTING: {
    label: "Conectando",
    detail: "Esperando confirmación del proveedor. Puede tardar unos segundos.",
  },
  CONNECTED: {
    label: "Conectado",
    detail: "Los mensajes se sincronizan con normalidad.",
  },
  DEGRADED: {
    label: "Con incidencias",
    detail: "Los mensajes siguen llegando, pero algo no va fino. Conviene revisarlo antes de que se corte.",
  },
  ERROR: {
    label: "Con error",
    detail: "La sincronización está detenida. Hay que resolver el error para volver a enviar y recibir.",
  },
  REVOKED: {
    label: "Permiso retirado",
    detail: "El proveedor ha retirado la autorización. Hay que volver a conectar el canal.",
  },
  DISCONNECTED: {
    label: "Desconectado",
    detail: "Este canal ya no sincroniza. Puedes volver a conectarlo cuando quieras.",
  },
};

const TONE_TO_BADGE: Record<AccountStatusTone, NonNullable<BadgeProps["tone"]>> = {
  ok: "success",
  pending: "neutral",
  warning: "warning",
  error: "destructive",
  inactive: "neutral",
};

function AccountCard({
  account,
  canDisconnect,
  isOwn = false,
  delegateName,
  showWebhookPath = false,
}: {
  account: {
    id: string;
    channel: string;
    status: MessagingAccountStatus;
    displayName: string | null;
    phoneE164: string | null;
    lastError: string | null;
    lastSyncAt: Date | null;
    connectedAt: Date | null;
  };
  canDisconnect: boolean;
  isOwn?: boolean;
  delegateName?: string;
  showWebhookPath?: boolean;
}) {
  const descriptor = describeAccountStatus(account.status);
  const copy = STATUS_COPY[account.status];

  return (
    <li>
      <Card className="flex flex-col gap-2 p-4">
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="type-label text-foreground">
              {account.displayName ?? account.channel}
              {delegateName && <span className="font-normal"> · {delegateName}</span>}
            </p>
            <p className="type-caption text-foreground-lighter">
              {account.channel}
              {account.phoneE164 && ` · ${account.phoneE164}`}
            </p>
          </div>
          <Badge tone={TONE_TO_BADGE[descriptor.tone]} dot className="shrink-0">
            {copy.label}
            {descriptor.needsAttention && " · revisar"}
          </Badge>
        </div>

        <p className="type-body text-foreground-light">{copy.detail}</p>

        {showWebhookPath && (
          <p className="type-caption text-foreground-lighter">
            <span className="font-medium text-foreground-light">URL del webhook</span> (regístrala en el panel del
            proveedor, precedida del dominio público):{" "}
            <code className="break-all font-mono">
              /api/webhooks/{account.channel}/{account.id}
            </code>
          </p>
        )}

        {account.lastError && (
          <p className="type-caption text-destructive-soft-foreground">
            <span className="font-medium">Último error:</span> {account.lastError}
          </p>
        )}

        <p className="type-caption text-foreground-lighter">
          {account.connectedAt && <>Conectado el {account.connectedAt.toLocaleDateString("es-ES")}. </>}
          {account.lastSyncAt
            ? `Última sincronización: ${account.lastSyncAt.toLocaleString("es-ES")}.`
            : "Sin sincronizaciones registradas todavía."}
        </p>

        {account.status !== "DISCONNECTED" &&
          (canDisconnect ? (
            <div>
              <DisconnectChannelButton accountId={account.id} />
            </div>
          ) : (
            <p className="type-caption text-foreground-lighter">
              {isOwn
                ? "Este canal se desconecta desde tu propio móvil, no desde Kindly."
                : "Solo el propio delegado puede desconectarlo, desde su móvil."}
            </p>
          ))}
      </Card>
    </li>
  );
}
