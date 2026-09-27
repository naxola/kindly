import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { requireCurrentOrganizationMember, listOrganizationMembers } from "@/modules/organizations/service";
import { getTask } from "@/modules/tasks/service";
import { listContacts } from "@/modules/contacts/service";
import { listCases } from "@/modules/cases/service";
import { updateTaskAction } from "@/modules/tasks/actions";
import { PageContainer } from "@/components/patterns/page-container";
import { PageHeader } from "@/components/patterns/page-header";
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Field } from "@/components/ui/field";
import { Checkbox, Input, NativeSelect, Textarea } from "@/components/ui/input";
import { SubmitButton } from "@/components/ui/submit-button";
import { pageTitle } from "@/lib/page-title";

function toDateInputValue(date: Date | null): string {
  return date ? date.toISOString().slice(0, 10) : "";
}

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const { id } = await params;
  const member = await requireCurrentOrganizationMember();
  const task = await getTask(member.organizationId, id);
  return { title: pageTitle(task?.title, "Tareas", member.organizationName) };
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
    <PageContainer>
      <PageHeader title={task.title} />

      <Card className="max-w-page-sm">
        <form action={updateThisTask} className="contents">
          <CardHeader>
            <CardTitle>Editar</CardTitle>
          </CardHeader>
          <CardContent>
            <Field label="Título">
              <Input type="text" name="title" defaultValue={task.title} required />
            </Field>
            <Field label="Contacto" optional>
              <NativeSelect name="contactId" defaultValue={task.contactId ?? ""}>
                <option value="">Sin contacto</option>
                {contacts.map((contact) => (
                  <option key={contact.id} value={contact.id}>
                    {contact.name}
                  </option>
                ))}
              </NativeSelect>
            </Field>
            <Field label="Caso" optional>
              <NativeSelect name="caseId" defaultValue={task.caseId ?? ""}>
                <option value="">Sin caso</option>
                {cases.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.title}
                  </option>
                ))}
              </NativeSelect>
            </Field>
            <Field label="Asignar a" optional>
              <NativeSelect name="assignedTo" defaultValue={task.assignedTo ?? ""}>
                <option value="">Sin asignar</option>
                {members.map((m) => (
                  <option key={m.userId} value={m.userId}>
                    {m.name}
                  </option>
                ))}
              </NativeSelect>
            </Field>
            <Field label="Fecha límite" optional>
              <Input type="date" name="dueDate" defaultValue={toDateInputValue(task.dueDate)} />
            </Field>
            <Field label="Descripción" optional>
              <Textarea name="description" defaultValue={task.description ?? ""} rows={3} />
            </Field>
            <label className="flex items-center gap-2 type-body text-foreground">
              <Checkbox name="completed" defaultChecked={Boolean(task.completedAt)} />
              Completada
            </label>
          </CardContent>
          <CardFooter>
            <SubmitButton>Guardar</SubmitButton>
          </CardFooter>
        </form>
      </Card>
    </PageContainer>
  );
}
