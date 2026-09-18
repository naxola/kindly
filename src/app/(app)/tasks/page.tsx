import Link from "next/link";
import { requireCurrentOrganizationMember, listOrganizationMembers } from "@/modules/organizations/service";
import { listTasks } from "@/modules/tasks/service";
import { listContacts } from "@/modules/contacts/service";
import { listCases } from "@/modules/cases/service";
import { createTaskAction, toggleTaskCompletedAction } from "@/modules/tasks/actions";

export default async function TasksPage() {
  const member = await requireCurrentOrganizationMember();
  const [tasks, contacts, cases, members] = await Promise.all([
    listTasks(member.organizationId),
    listContacts(member.organizationId),
    listCases(member.organizationId),
    listOrganizationMembers(member.organizationId),
  ]);

  return (
    <div className="flex flex-col gap-8">
      <div>
        <h1 className="text-xl font-semibold">Tasks</h1>
        <p className="text-sm text-zinc-500">Seguimiento: llamar, pedir un documento, revisar normativa...</p>
      </div>

      <form action={createTaskAction} className="flex flex-col gap-2 rounded border border-zinc-200 p-4">
        <h2 className="text-sm font-medium">Nueva task</h2>
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
          <input
            className="rounded border border-zinc-300 px-3 py-2 text-sm sm:col-span-2"
            type="text"
            name="title"
            placeholder="Título"
            required
          />
          <select
            className="rounded border border-zinc-300 px-3 py-2 text-sm"
            name="contactId"
            aria-label="Contact"
            defaultValue=""
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
            defaultValue=""
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
            defaultValue=""
          >
            <option value="">Sin asignar</option>
            {members.map((m) => (
              <option key={m.userId} value={m.userId}>
                {m.name}
              </option>
            ))}
          </select>
          <input className="rounded border border-zinc-300 px-3 py-2 text-sm" type="date" name="dueDate" />
        </div>
        <button
          type="submit"
          className="mt-1 w-fit rounded bg-zinc-900 px-3 py-1.5 text-sm font-medium text-white"
        >
          Crear
        </button>
      </form>

      <ul className="flex flex-col gap-1 text-sm">
        {tasks.map((task) => {
          const toggleThisTask = toggleTaskCompletedAction.bind(null, task.id);
          return (
            <li
              key={task.id}
              className="flex items-center justify-between gap-2 border-b border-zinc-100 py-2"
            >
              <div className="flex items-center gap-2">
                <form action={toggleThisTask}>
                  <button
                    type="submit"
                    aria-label={task.completedAt ? "Marcar como pendiente" : "Marcar como completada"}
                    className={`h-4 w-4 rounded-sm border ${
                      task.completedAt ? "border-zinc-900 bg-zinc-900" : "border-zinc-400"
                    }`}
                  />
                </form>
                <Link
                  href={`/tasks/${task.id}`}
                  className={task.completedAt ? "text-zinc-400 line-through" : "underline"}
                >
                  {task.title}
                </Link>
              </div>
              {task.dueDate && (
                <span className="text-zinc-400">{task.dueDate.toLocaleDateString("es-ES")}</span>
              )}
            </li>
          );
        })}
        {tasks.length === 0 && <li className="py-4 text-center text-zinc-400">Todavía no hay tasks.</li>}
      </ul>
    </div>
  );
}
