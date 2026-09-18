import Link from "next/link";
import { requireCurrentOrganizationMember, listOrganizationMembers } from "@/modules/organizations/service";
import { listCases } from "@/modules/cases/service";
import { listContacts } from "@/modules/contacts/service";
import { createCaseAction } from "@/modules/cases/actions";

export default async function CasesPage() {
  const member = await requireCurrentOrganizationMember();
  const [cases, contacts, members] = await Promise.all([
    listCases(member.organizationId),
    listContacts(member.organizationId),
    listOrganizationMembers(member.organizationId),
  ]);

  const contactNameById = new Map(contacts.map((contact) => [contact.id, contact.name]));

  return (
    <div className="flex flex-col gap-8">
      <div>
        <h1 className="text-xl font-semibold">Cases</h1>
        <p className="text-sm text-zinc-500">
          Un asunto que necesita gestión — distinto de una conversación.
        </p>
      </div>

      <form action={createCaseAction} className="flex flex-col gap-2 rounded border border-zinc-200 p-4">
        <h2 className="text-sm font-medium">Nuevo case</h2>
        {contacts.length === 0 ? (
          <p className="text-sm text-zinc-400">
            Crea primero un Contact para poder abrir un Case.
          </p>
        ) : (
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            <select
              className="rounded border border-zinc-300 px-3 py-2 text-sm"
              name="contactId"
              aria-label="Contact"
              required
              defaultValue=""
            >
              <option value="" disabled>
                Contact
              </option>
              {contacts.map((contact) => (
                <option key={contact.id} value={contact.id}>
                  {contact.name}
                </option>
              ))}
            </select>
            <input
              className="rounded border border-zinc-300 px-3 py-2 text-sm"
              type="text"
              name="title"
              placeholder="Título"
              required
            />
            <input
              className="rounded border border-zinc-300 px-3 py-2 text-sm"
              type="text"
              name="priority"
              placeholder="Prioridad (texto libre, opcional)"
            />
            <select
              className="rounded border border-zinc-300 px-3 py-2 text-sm"
              name="assignedTo"
              aria-label="Asignar a"
              defaultValue=""
            >
              <option value="">Sin asignar</option>
              {members.map((m) => (
                <option key={m.userId} value={m.userId}>
                  {m.name}
                </option>
              ))}
            </select>
            <textarea
              className="rounded border border-zinc-300 px-3 py-2 text-sm sm:col-span-2"
              name="description"
              placeholder="Descripción"
              rows={2}
            />
          </div>
        )}
        {contacts.length > 0 && (
          <button
            type="submit"
            className="mt-1 w-fit rounded bg-zinc-900 px-3 py-1.5 text-sm font-medium text-white"
          >
            Crear
          </button>
        )}
      </form>

      <table className="w-full text-left text-sm">
        <thead>
          <tr className="border-b border-zinc-200 text-zinc-500">
            <th className="py-2 font-medium">Título</th>
            <th className="py-2 font-medium">Contact</th>
            <th className="py-2 font-medium">Estado</th>
          </tr>
        </thead>
        <tbody>
          {cases.map((c) => (
            <tr key={c.id} className="border-b border-zinc-100">
              <td className="py-2">
                <Link href={`/cases/${c.id}`} className="underline">
                  {c.title}
                </Link>
              </td>
              <td className="py-2 text-zinc-500">{contactNameById.get(c.contactId) ?? "—"}</td>
              <td className="py-2 text-zinc-500">{c.status}</td>
            </tr>
          ))}
          {cases.length === 0 && (
            <tr>
              <td colSpan={3} className="py-4 text-center text-zinc-400">
                Todavía no hay cases.
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}
