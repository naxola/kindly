import { notFound } from "next/navigation";
import { requireCurrentOrganizationMember } from "@/modules/organizations/service";
import { getContact } from "@/modules/contacts/service";
import { updateContactAction } from "@/modules/contacts/actions";
import { listActivitiesForEntity } from "@/modules/audit/service";
import { ActivityFeed } from "@/app/(app)/activity-feed";

export default async function ContactDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const member = await requireCurrentOrganizationMember();
  const contact = await getContact(member.organizationId, id);

  if (!contact) {
    notFound();
  }

  const activities = await listActivitiesForEntity(member.organizationId, "contact", contact.id);
  const updateThisContact = updateContactAction.bind(null, contact.id);

  return (
    <div className="flex flex-col gap-8">
      <div>
        <h1 className="text-xl font-semibold">{contact.name}</h1>
        <p className="text-sm text-zinc-500">
          Creado el {contact.createdAt.toLocaleDateString("es-ES")}
        </p>
      </div>

      <form action={updateThisContact} className="flex flex-col gap-2 rounded border border-zinc-200 p-4">
        <h2 className="text-sm font-medium">Editar</h2>
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
          <input
            className="rounded border border-zinc-300 px-3 py-2 text-sm"
            type="text"
            name="name"
            defaultValue={contact.name}
            required
          />
          <input
            className="rounded border border-zinc-300 px-3 py-2 text-sm"
            type="tel"
            name="phoneE164"
            defaultValue={contact.phoneE164 ?? ""}
            placeholder="+34600111222"
          />
          <input
            className="rounded border border-zinc-300 px-3 py-2 text-sm"
            type="email"
            name="email"
            defaultValue={contact.email ?? ""}
          />
          <input
            className="rounded border border-zinc-300 px-3 py-2 text-sm"
            type="text"
            name="notes"
            defaultValue={contact.notes ?? ""}
            placeholder="Notas"
          />
        </div>
        <button
          type="submit"
          className="mt-1 w-fit rounded bg-zinc-900 px-3 py-1.5 text-sm font-medium text-white"
        >
          Guardar
        </button>
      </form>

      <ActivityFeed activities={activities} />
    </div>
  );
}
