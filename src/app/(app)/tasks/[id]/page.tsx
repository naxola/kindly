import { notFound } from "next/navigation";
import { requireCurrentOrganizationMember, listOrganizationMembers } from "@/modules/organizations/service";
import { getTask } from "@/modules/tasks/service";
import { listContacts } from "@/modules/contacts/service";
import { listCases } from "@/modules/cases/service";
import { updateTaskAction } from "@/modules/tasks/actions";

function toDateInputValue(date: Date | null): string {
  return date ? date.toISOString().slice(0, 10) : "";
}

export default async function TaskDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const member = await requireCurrentOrganizationMember();
  const task = await getTask(member.organizationId, id);

  if (!task) {
    notFound();
  }

  const [contacts, cases, members] = await Promise.all([
    listContacts(member.organizationId),
    listCases(member.organizationId),
    listOrganizationMembers(member.organizationId),
  ]);

  const updateThisTask = updateTaskAction.bind(null, task.id);

  return (
    <div className="flex flex-col gap-8">
      <h1 className="text-xl font-semibold">{task.title}</h1>

      <form action={updateThisTask} className="flex flex-col gap-2 rounded border border-zinc-200 p-4">
        <h2 className="text-sm font-medium">Editar</h2>
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
          <input
            className="rounded border border-zinc-300 px-3 py-2 text-sm sm:col-span-2"
            type="text"
            name="title"
            defaultValue={task.title}
            required
          />
          <select
            className="rounded border border-zinc-300 px-3 py-2 text-sm"
            name="contactId"
            aria-label="Contact"
            defaultValue={task.contactId ?? ""}
          >
            <option value="">Sin contact</option>
            {contacts.map((contact) => (
              <option key={contact.id} value={contact.id}>
                {contact.name}
              </option>
            ))}
          </select>
          <select
            className="rounded border border-zinc-300 px-3 py-2 text-sm"
            name="caseId"
            aria-label="Case"
            defaultValue={task.caseId ?? ""}
          >
            <option value="">Sin case</option>
            {cases.map((c) => (
              <option key={c.id} value={c.id}>
                {c.title}
              </option>
            ))}
          </select>
          <select
            className="rounded border border-zinc-300 px-3 py-2 text-sm"
            name="assignedTo"
            aria-label="Asignar a"
            defaultValue={task.assignedTo ?? ""}
          >
            <option value="">Sin asignar</option>
            {members.map((m) => (
              <option key={m.userId} value={m.userId}>
                {m.name}
              </option>
            ))}
          </select>
          <input
            className="rounded border border-zinc-300 px-3 py-2 text-sm"
            type="date"
            name="dueDate"
            defaultValue={toDateInputValue(task.dueDate)}
          />
          <textarea
            className="rounded border border-zinc-300 px-3 py-2 text-sm sm:col-span-2"
            name="description"
            defaultValue={task.description ?? ""}
            rows={3}
          />
          <label className="flex items-center gap-2 text-sm sm:col-span-2">
            <input type="checkbox" name="completed" defaultChecked={Boolean(task.completedAt)} />
            Completada
          </label>
        </div>
        <button
          type="submit"
          className="mt-1 w-fit rounded bg-zinc-900 px-3 py-1.5 text-sm font-medium text-white"
        >
          Guardar
        </button>
      </form>
    </div>
  );
}
