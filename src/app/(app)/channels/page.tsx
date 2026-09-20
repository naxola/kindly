import { requireCurrentOrganizationMember, listOrganizationMembers } from "@/modules/organizations/service";
import { listMessagingAccountsForMember } from "@/modules/messaging/service";
import { getChannelCapabilities, listRegisteredChannels } from "@/modules/messaging/registry";
import { describeAccountStatus, type AccountStatusTone } from "@/modules/messaging/domain";
import { connectMessagingAccountAction, disconnectMessagingAccountAction } from "@/modules/messaging/actions";
import type { MessagingAccountStatus } from "@/modules/messaging/schema";

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
export default async function ChannelsPage() {
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
    <div className="flex flex-col gap-8">
      <div>
        <h1 className="text-xl font-semibold">Mis canales</h1>
        <p className="text-sm text-zinc-500">
          Cada profesional conecta su propia cuenta de WhatsApp o Telegram. Kindly sincroniza esa conversación, no
          la sustituye ni la centraliza en un número de la organización.
        </p>
      </div>

      <section className="flex flex-col gap-3">
        <h2 className="text-sm font-medium">Conectados a tu nombre</h2>
        {myAccounts.length === 0 ? (
          <p className="text-sm text-zinc-400">Todavía no has conectado ningún canal.</p>
        ) : (
          <ul className="flex flex-col gap-3" aria-label="Canales conectados a tu nombre">
            {myAccounts.map((account) => (
              <AccountCard
                key={account.id}
                account={account}
                canDisconnect={getChannelCapabilities(account.channel)?.canDisconnect ?? false}
                isOwn
              />
            ))}
          </ul>
        )}
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="text-sm font-medium">Conectar un canal</h2>
        {availableChannels.length === 0 ? (
          <p className="text-sm text-zinc-400">
            No hay ningún proveedor de mensajería disponible todavía. WhatsApp y Telegram llegan en fases futuras
            (ver project/TASKS.md).
          </p>
        ) : (
          <ul className="flex flex-col gap-2">
            {availableChannels.map((channel) => {
              const alreadyConnected = myConnectedChannels.has(channel);
              return (
                <li
                  key={channel}
                  className="flex items-center justify-between rounded border border-zinc-200 px-4 py-3"
                >
                  <div>
                    <p className="text-sm font-medium">{channel}</p>
                    <p className="text-xs text-zinc-500">
                      {alreadyConnected
                        ? "Ya tienes una cuenta conectada en este canal."
                        : "Se conectará con tu propia cuenta, a tu nombre."}
                    </p>
                  </div>
                  {!alreadyConnected && (
                    <form action={connectMessagingAccountAction}>
                      <input type="hidden" name="channel" value={channel} />
                      <button
                        type="submit"
                        className="rounded bg-zinc-900 px-3 py-1.5 text-sm font-medium text-white"
                      >
                        Conectar {channel}
                      </button>
                    </form>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </section>

      {member.role === "ADMIN" && (
        <section className="flex flex-col gap-3">
          <h2 className="text-sm font-medium">Canales del resto de la organización</h2>
          {otherAccounts.length === 0 ? (
            <p className="text-sm text-zinc-400">Ningún otro miembro ha conectado un canal todavía.</p>
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
        </section>
      )}
    </div>
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

const TONE_CLASSES: Record<AccountStatusTone, string> = {
  ok: "border-emerald-200 bg-emerald-50 text-emerald-900",
  pending: "border-zinc-200 bg-zinc-50 text-zinc-700",
  warning: "border-amber-200 bg-amber-50 text-amber-900",
  error: "border-red-200 bg-red-50 text-red-900",
  inactive: "border-zinc-200 bg-zinc-50 text-zinc-500",
};

function AccountCard({
  account,
  canDisconnect,
  isOwn = false,
  delegateName,
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
}) {
  const descriptor = describeAccountStatus(account.status);
  const copy = STATUS_COPY[account.status];
  const disconnectThisAccount = disconnectMessagingAccountAction.bind(null, account.id);

  return (
    <li className={`flex flex-col gap-2 rounded border p-4 ${TONE_CLASSES[descriptor.tone]}`}>
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-sm font-medium">
            {account.displayName ?? account.channel}
            {delegateName && <span className="font-normal"> · {delegateName}</span>}
          </p>
          <p className="text-xs opacity-80">
            {account.channel}
            {account.phoneE164 && ` · ${account.phoneE164}`}
          </p>
        </div>
        <span className="shrink-0 text-xs font-medium uppercase tracking-wide">
          {copy.label}
          {descriptor.needsAttention && " · revisar"}
        </span>
      </div>

      <p className="text-xs opacity-90">{copy.detail}</p>

      {account.lastError && (
        <p className="text-xs">
          <span className="font-medium">Último error:</span> {account.lastError}
        </p>
      )}

      <p className="text-xs opacity-70">
        {account.connectedAt && <>Conectado el {account.connectedAt.toLocaleDateString("es-ES")}. </>}
        {account.lastSyncAt
          ? `Última sincronización: ${account.lastSyncAt.toLocaleString("es-ES")}.`
          : "Sin sincronizaciones registradas todavía."}
      </p>

      {account.status !== "DISCONNECTED" &&
        (canDisconnect ? (
          <form action={disconnectThisAccount}>
            <button type="submit" className="text-xs underline">
              Desconectar
            </button>
          </form>
        ) : (
          <p className="text-xs opacity-70">
            {isOwn
              ? "Este canal se desconecta desde tu propio móvil, no desde Kindly."
              : "Solo el propio delegado puede desconectarlo, desde su móvil."}
          </p>
        ))}
    </li>
  );
}
