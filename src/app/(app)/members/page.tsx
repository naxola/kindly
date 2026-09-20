import { requireCurrentOrganizationMember, listOrganizationMembers } from "@/modules/organizations/service";
import { listInvitations } from "@/modules/organizations/invitations";
import { inviteMemberAction, revokeInvitationAction } from "@/modules/organizations/actions";

/**
 * Organization members and pending invitations (PKG-006).
 *
 * Kindly does not send email yet, so an invitation is a link the ADMIN
 * copies and passes on by whatever means they already use. That is a real
 * limitation, shown as such rather than hidden behind a "Sent!" toast that
 * would be a lie (see docs/DECISIONS.md).
 */
export default async function MembersPage() {
  const member = await requireCurrentOrganizationMember();
  const isAdmin = member.role === "ADMIN";

  const [members, invitations] = await Promise.all([
    listOrganizationMembers(member.organizationId),
    listInvitations(member.organizationId),
  ]);

  const pending = invitations.filter((invitation) => invitation.status === "PENDING");
  const baseUrl = process.env.BETTER_AUTH_URL ?? "";

  return (
    <div className="flex flex-col gap-8">
      <div>
        <h1 className="text-xl font-semibold">Miembros</h1>
        <p className="text-sm text-zinc-500">
          Un ADMIN gestiona la organización; un DELEGATE atiende sus propias conversaciones. Cada persona pertenece
          a una sola organización.
        </p>
      </div>

      {isAdmin && (
        <div className="flex flex-col gap-2 rounded border border-zinc-200 p-4">
          <h2 className="text-sm font-medium">Invitar a alguien</h2>
          <form action={inviteMemberAction} className="flex flex-wrap items-end gap-2">
            <input
              className="rounded border border-zinc-300 px-3 py-2 text-sm"
              type="email"
              name="email"
              placeholder="email@ejemplo.com"
              aria-label="Email"
              required
            />
            <select
              className="rounded border border-zinc-300 px-3 py-2 text-sm"
              name="role"
              aria-label="Rol"
              defaultValue="DELEGATE"
            >
              <option value="DELEGATE">DELEGATE</option>
              <option value="ADMIN">ADMIN</option>
            </select>
            <button type="submit" className="rounded bg-zinc-900 px-3 py-1.5 text-sm font-medium text-white">
              Invitar
            </button>
          </form>
          <p className="text-xs text-zinc-500">
            Kindly todavía no envía emails: al invitar se genera un enlace que tienes que hacer llegar tú a esa
            persona. La invitación caduca a los 7 días.
          </p>
        </div>
      )}

      <div className="flex flex-col gap-2">
        <h2 className="text-sm font-medium">En la organización</h2>
        <table className="w-full text-left text-sm">
          <thead>
            <tr className="border-b border-zinc-200 text-zinc-500">
              <th className="py-2 font-medium">Nombre</th>
              <th className="py-2 font-medium">Email</th>
              <th className="py-2 font-medium">Rol</th>
            </tr>
          </thead>
          <tbody>
            {members.map((row) => (
              <tr key={row.userId} className="border-b border-zinc-100">
                <td className="py-2">
                  {row.name}
                  {row.userId === member.userId && <span className="text-zinc-400"> (tú)</span>}
                </td>
                <td className="py-2 text-zinc-500">{row.email}</td>
                <td className="py-2 text-zinc-500">{row.role}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {isAdmin && (
        <div className="flex flex-col gap-2">
          <h2 className="text-sm font-medium">Invitaciones pendientes</h2>
          {pending.length === 0 ? (
            <p className="text-sm text-zinc-400">No hay invitaciones pendientes.</p>
          ) : (
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b border-zinc-200 text-zinc-500">
                  <th className="py-2 font-medium">Email</th>
                  <th className="py-2 font-medium">Rol</th>
                  <th className="py-2 font-medium">Enlace</th>
                  <th className="py-2 font-medium">Caduca</th>
                  <th className="py-2 font-medium" />
                </tr>
              </thead>
              <tbody>
                {pending.map((invitation) => {
                  const revokeThisInvitation = revokeInvitationAction.bind(null, invitation.id);
                  return (
                    <tr key={invitation.id} className="border-b border-zinc-100">
                      <td className="py-2">{invitation.email}</td>
                      <td className="py-2 text-zinc-500">{invitation.role}</td>
                      <td className="py-2">
                        <code className="break-all text-xs text-zinc-500">
                          {baseUrl}/invite/{invitation.token}
                        </code>
                      </td>
                      <td className="py-2 text-zinc-500">{invitation.expiresAt.toLocaleDateString("es-ES")}</td>
                      <td className="py-2 text-right">
                        <form action={revokeThisInvitation}>
                          <button type="submit" className="text-xs underline">
                            Revocar
                          </button>
                        </form>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>
      )}
    </div>
  );
}
