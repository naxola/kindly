import { notFound } from "next/navigation";
import { requireCurrentOrganizationMember, listOrganizationMembers } from "@/modules/organizations/service";
import { getCase } from "@/modules/cases/service";
import { caseStatus } from "@/modules/cases/schema";
import { getContact } from "@/modules/contacts/service";
import { updateCaseAction } from "@/modules/cases/actions";
import { listActivitiesForEntity } from "@/modules/audit/service";
import { ActivityFeed } from "@/app/(app)/activity-feed";

export default async function CaseDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const member = await requireCurrentOrganizationMember();
  const caseRecord = await getCase(member.organizationId, id);

  if (!caseRecord) {
    notFound();
  }

  const [contact, members, activities] = await Promise.all([
    getContact(member.organizationId, caseRecord.contactId),
    listOrganizationMembers(member.organizationId),
    listActivitiesForEntity(member.organizationId, "case", caseRecord.id),
  ]);

  const updateThisCase = updateCaseAction.bind(null, caseRecord.id);

  return (
    <div className="flex flex-col gap-8">
      <div>
        <h1 className="text-xl font-semibold">{caseRecord.title}</h1>
        <p className="text-sm text-zinc-500">Contact: {contact?.name ?? "—"}</p>
      </div>

      <form action={updateThisCase} className="flex flex-col gap-2 rounded border border-zinc-200 p-4">
        <h2 className="text-sm font-medium">Editar</h2>
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
          <input
            className="rounded border border-zinc-300 px-3 py-2 text-sm"
            type="text"
            name="title"
            defaultValue={caseRecord.title}
            required
          />
          <select
            className="rounded border border-zinc-300 px-3 py-2 text-sm"
            name="status"
            aria-label="Estado"
            defaultValue={caseRecord.status}
            required
          >
            {caseStatus.enumValues.map((status) => (
              <option key={status} value={status}>
                {status}
              </option>
            ))}
          </select>
          <input
            className="rounded border border-zinc-300 px-3 py-2 text-sm"
            type="text"
            name="priority"
            defaultValue={caseRecord.priority ?? ""}
            placeholder="Prioridad (texto libre)"
          />
          <select
            className="rounded border border-zinc-300 px-3 py-2 text-sm"
            name="assignedTo"
            aria-label="Asignar a"
            defaultValue={caseRecord.assignedTo ?? ""}
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
            defaultValue={caseRecord.description ?? ""}
            rows={3}
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
