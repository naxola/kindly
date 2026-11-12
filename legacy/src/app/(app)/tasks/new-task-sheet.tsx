"use client";

import { useState } from "react";
import { Plus } from "lucide-react";
import { createTaskAction } from "@/modules/tasks/actions";
import { useCloseAfterAction } from "@/components/patterns/use-close-after-action";
import { Button } from "@/components/ui/button";
import { SubmitButton } from "@/components/ui/submit-button";
import { Field } from "@/components/ui/field";
import { Input, NativeSelect } from "@/components/ui/input";
import { Sheet, SheetBody, SheetContent, SheetFooter, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";

interface Option {
  id: string;
  name: string;
}

/** Alta de Task: 5 campos, Sheet (docs/ui/COMPONENTS.md §4). */
export function NewTaskSheet({
  contacts,
  cases,
  members,
}: {
  contacts: Option[];
  cases: Option[];
  members: Option[];
}) {
  const [open, setOpen] = useState(false);
  const createAndClose = useCloseAfterAction(createTaskAction, () => setOpen(false));

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild>
        <Button variant="primary" icon={<Plus />}>
          Nueva tarea
        </Button>
      </SheetTrigger>
      <SheetContent size="sm">
        <SheetHeader>
          <SheetTitle>Nueva tarea</SheetTitle>
        </SheetHeader>
        <form action={createAndClose} className="contents">
          <SheetBody className="flex flex-col gap-4">
            <Field label="Título">
              <Input type="text" name="title" required />
            </Field>
            <Field label="Contacto" optional>
              <NativeSelect name="contactId" defaultValue="">
                <option value="">Sin contacto</option>
                {contacts.map((contact) => (
                  <option key={contact.id} value={contact.id}>
                    {contact.name}
                  </option>
                ))}
              </NativeSelect>
            </Field>
            <Field label="Caso" optional>
              <NativeSelect name="caseId" defaultValue="">
                <option value="">Sin caso</option>
                {cases.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </NativeSelect>
            </Field>
            <Field label="Asignar a" optional>
              <NativeSelect name="assignedTo" defaultValue="">
                <option value="">Sin asignar</option>
                {members.map((member) => (
                  <option key={member.id} value={member.id}>
                    {member.name}
                  </option>
                ))}
              </NativeSelect>
            </Field>
            <Field label="Fecha límite" optional>
              <Input type="date" name="dueDate" />
            </Field>
          </SheetBody>
          <SheetFooter>
            <Button onClick={() => setOpen(false)}>Cancelar</Button>
            <SubmitButton>Crear tarea</SubmitButton>
          </SheetFooter>
        </form>
      </SheetContent>
    </Sheet>
  );
}
