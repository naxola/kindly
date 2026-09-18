import { requireCurrentOrganizationMember, listOrganizationMembers } from "@/modules/organizations/service";
import { listMessagingAccounts } from "@/modules/messaging/service";
import { listRegisteredChannels } from "@/modules/messaging/registry";
import { connectMessagingAccountAction, disconnectMessagingAccountAction } from "@/modules/messaging/actions";

export default async function ChannelsPage() {
  const member = await requireCurrentOrganizationMember();
  const [accounts, members] = await Promise.all([
    listMessagingAccounts(member.organizationId),
    listOrganizationMembers(member.organizationId),
  ]);
  const availableChannels = listRegisteredChannels();
  const memberNameById = new Map(members.map((m) => [m.userId, m.name]));

  return (
    <div className="flex flex-col gap-8">
      <div>
        <h1 className="text-xl font-semibold">Canales</h1>
        <p className="text-sm text-zinc-500">
          Cada DELEGATE conecta su propia identidad de comunicación (WhatsApp, Telegram). Kindly sincroniza, no
          centraliza.
        </p>
      </div>

      <div className="flex flex-col gap-2 rounded border border-zinc-200 p-4">
        <h2 className="text-sm font-medium">Conectar un canal</h2>
        {availableChannels.length === 0 ? (
          <p className="text-sm text-zinc-400">
            No hay ningún proveedor de mensajería disponible todavía. Telegram y WhatsApp llegan en fases futuras
            (ver project/TASKS.md) — validación técnica pendiente.
          </p>
        ) : (
          <form action={connectMessagingAccountAction} className="flex flex-wrap items-end gap-2">
            <select
              className="rounded border border-zinc-300 px-3 py-2 text-sm"
              name="channel"
              aria-label="Canal"
              required
              defaultValue=""
            >
              <option value="" disabled>
                Canal
              </option>
              {availableChannels.map((ch) => (
                <option key={ch} value={ch}>
                  {ch}
                </option>
              ))}
            </select>
            <select
              className="rounded border border-zinc-300 px-3 py-2 text-sm"
              name="delegateId"
              aria-label="Delegate"
              required
              defaultValue=""
            >
              <option value="" disabled>
                Delegate
              </option>
              {members.map((m) => (
                <option key={m.userId} value={m.userId}>
                  {m.name}
                </option>
              ))}
            </select>
            <button type="submit" className="rounded bg-zinc-900 px-3 py-1.5 text-sm font-medium text-white">
              Conectar
            </button>
          </form>
        )}
      </div>

      <table className="w-full text-left text-sm">
        <thead>
          <tr className="border-b border-zinc-200 text-zinc-500">
            <th className="py-2 font-medium">Canal</th>
            <th className="py-2 font-medium">Delegate</th>
            <th className="py-2 font-medium">Estado</th>
            <th className="py-2 font-medium" />
          </tr>
        </thead>
        <tbody>
          {accounts.map((account) => {
            const disconnectThisAccount = disconnectMessagingAccountAction.bind(null, account.id);
            return (
              <tr key={account.id} className="border-b border-zinc-100">
                <td className="py-2">{account.displayName ?? account.channel}</td>
                <td className="py-2 text-zinc-500">{memberNameById.get(account.delegateId) ?? "—"}</td>
                <td className="py-2 text-zinc-500">{account.status}</td>
                <td className="py-2 text-right">
                  {account.status !== "DISCONNECTED" && (
                    <form action={disconnectThisAccount}>
                      <button type="submit" className="text-xs underline">
                        Desconectar
                      </button>
                    </form>
                  )}
                </td>
              </tr>
            );
          })}
          {accounts.length === 0 && (
            <tr>
              <td colSpan={4} className="py-4 text-center text-zinc-400">
                Todavía no hay canales conectados.
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}
