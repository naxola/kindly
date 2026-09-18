import Link from "next/link";
import { requireCurrentOrganizationMember } from "@/modules/organizations/service";
import { listContacts } from "@/modules/contacts/service";
import { createContactAction } from "@/modules/contacts/actions";

export default async function ContactsPage() {
  const member = await requireCurrentOrganizationMember();
  const contacts = await listContacts(member.organizationId);

  return (
    <div className="flex flex-col gap-8">
      <div>
        <h1 className="text-xl font-semibold">Contacts</h1>
        <p className="text-sm text-zinc-500">
          Personas con las que la organización tiene una relación. No son
          usuarios de Kindly.
        </p>
      </div>

      <form action={createContactAction} className="flex flex-col gap-2 rounded border border-zinc-200 p-4">
        <h2 className="text-sm font-medium">Nuevo contact</h2>
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
          <input
            className="rounded border border-zinc-300 px-3 py-2 text-sm"
            type="text"
            name="name"
            placeholder="Nombre"
            required
          />
          <input
            className="rounded border border-zinc-300 px-3 py-2 text-sm"
            type="tel"
            name="phoneE164"
            placeholder="+34600111222"
          />
          <input
            className="rounded border border-zinc-300 px-3 py-2 text-sm"
            type="email"
            name="email"
            placeholder="Email"
          />
          <input
            className="rounded border border-zinc-300 px-3 py-2 text-sm"
            type="text"
            name="notes"
            placeholder="Notas"
          />
        </div>
        <button
          type="submit"
          className="mt-1 w-fit rounded bg-zinc-900 px-3 py-1.5 text-sm font-medium text-white"
        >
          Crear
        </button>
      </form>

      <table className="w-full text-left text-sm">
        <thead>
          <tr className="border-b border-zinc-200 text-zinc-500">
            <th className="py-2 font-medium">Nombre</th>
            <th className="py-2 font-medium">Teléfono</th>
            <th className="py-2 font-medium">Email</th>
          </tr>
        </thead>
        <tbody>
          {contacts.map((contact) => (
            <tr key={contact.id} className="border-b border-zinc-100">
              <td className="py-2">
                <Link href={`/contacts/${contact.id}`} className="underline">
                  {contact.name}
                </Link>
              </td>
              <td className="py-2 text-zinc-500">{contact.phoneE164 ?? "—"}</td>
              <td className="py-2 text-zinc-500">{contact.email ?? "—"}</td>
            </tr>
          ))}
          {contacts.length === 0 && (
            <tr>
              <td colSpan={3} className="py-4 text-center text-zinc-400">
                Todavía no hay contacts.
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}
