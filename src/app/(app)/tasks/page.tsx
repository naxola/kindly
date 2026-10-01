import type { Metadata } from "next";
import Link from "next/link";
import { requireCurrentOrganizationMember, listOrganizationMembers } from "@/modules/organizations/service";
import { listTasksForMember } from "@/modules/tasks/service";
import { listContactsForMember } from "@/modules/contacts/service";
import { listCasesForMember } from "@/modules/cases/service";
import { toggleTaskCompletedAction } from "@/modules/tasks/actions";
import { NewTaskSheet } from "@/app/(app)/tasks/new-task-sheet";
import { PageContainer } from "@/components/patterns/page-container";
import { PageHeader } from "@/components/patterns/page-header";
import { Table, TableBody, TableCell, TableEmpty, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { cn } from "@/lib/cn";
import { pageTitle } from "@/lib/page-title";

export async function generateMetadata(): Promise<Metadata> {
  const member = await requireCurrentOrganizationMember();
  return { title: pageTitle("Tareas", member.organizationName) };
}

export default async function TasksPage() {
  const member = await requireCurrentOrganizationMember();
  const [tasks, contacts, cases, members] = await Promise.all([
    listTasksForMember(member.organizationId, member),
    listContactsForMember(member.organizationId, member),
    listCasesForMember(member.organizationId, member),
    listOrganizationMembers(member.organizationId),
  ]);

  return (
    <PageContainer>
      <PageHeader
        title="Tareas"
        description="Seguimiento: llamar, pedir un documento, revisar normativa"
        aside={
          <NewTaskSheet
            contacts={contacts}
            cases={cases.map((c) => ({ id: c.id, name: c.title }))}
            members={members.map((m) => ({ id: m.userId, name: m.name }))}
          />
        }
      />

      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>
              <span className="sr-only">Completada</span>
            </TableHead>
            <TableHead>Título</TableHead>
            <TableHead>Fecha límite</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {tasks.map((task) => {
            const toggleThisTask = toggleTaskCompletedAction.bind(null, task.id);
            return (
              <TableRow key={task.id}>
                <TableCell className="w-8">
                  <form action={toggleThisTask}>
                    <button
                      type="submit"
                      aria-label={task.completedAt ? "Marcar como pendiente" : "Marcar como completada"}
                      className={cn(
                        "size-4 rounded-sm border focus-ring",
                        task.completedAt ? "border-primary bg-primary" : "border-border-control",
                      )}
                    />
                  </form>
                </TableCell>
                <TableCell>
                  <Link
                    href={`/tasks/${task.id}`}
                    className={cn(
                      "focus-ring rounded-sm font-medium",
                      task.completedAt ? "text-foreground-muted line-through" : "text-foreground",
                    )}
                  >
                    {task.title}
                  </Link>
                </TableCell>
                <TableCell className="text-foreground-lighter">
                  {task.dueDate ? task.dueDate.toLocaleDateString("es-ES") : "—"}
                </TableCell>
              </TableRow>
            );
          })}
          {tasks.length === 0 && <TableEmpty colSpan={3} title="Todavía no hay tareas" />}
        </TableBody>
      </Table>
    </PageContainer>
  );
}
