"use client";

import { useState } from "react";
import { Plus } from "lucide-react";
import { createCaseAction } from "@/modules/cases/actions";
import { useCloseAfterAction } from "@/components/patterns/use-close-after-action";
import { Button } from "@/components/ui/button";
import { SubmitButton } from "@/components/ui/submit-button";
import { Field } from "@/components/ui/field";
import { Input, NativeSelect, Textarea } from "@/components/ui/input";
import { Sheet, SheetBody, SheetContent, SheetFooter, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";

interface Option {
  id: string;
  name: string;
}

/** Alta de Case: 5 campos, Sheet (docs/ui/COMPONENTS.md §4). */
export function NewCaseSheet({ contacts, members }: { contacts: Option[]; members: Option[] }) {
  const [open, setOpen] = useState(false);
  const createAndClose = useCloseAfterAction(createCaseAction, () => setOpen(false));

  if (contacts.length === 0) {
    return (
      <Button variant="primary" icon={<Plus />} disabled disabledReason="Crea primero un contacto para poder abrir un caso.">
        Nuevo caso
      </Button>
    );
  }

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild>
        <Button variant="primary" icon={<Plus />}>
          Nuevo caso
        </Button>
      </SheetTrigger>
      <SheetContent size="sm">
        <SheetHeader>
          <SheetTitle>Nuevo caso</SheetTitle>
        </SheetHeader>
        <form action={createAndClose} className="contents">
          <SheetBody className="flex flex-col gap-4">
            <Field label="Contacto">
              <NativeSelect name="contactId" required defaultValue="">
                <option value="" disabled>
                  Elige un contacto
                </option>
                {contacts.map((contact) => (
                  <option key={contact.id} value={contact.id}>
                    {contact.name}
                  </option>
                ))}
              </NativeSelect>
            </Field>
            <Field label="Título">
              <Input type="text" name="title" required />
            </Field>
            <Field label="Prioridad" optional description="Texto libre.">
              <Input type="text" name="priority" />
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
            <Field label="Descripción" optional>
              <Textarea name="description" rows={3} />
            </Field>
          </SheetBody>
          <SheetFooter>
            <Button onClick={() => setOpen(false)}>Cancelar</Button>
            <SubmitButton>Crear caso</SubmitButton>
          </SheetFooter>
        </form>
      </SheetContent>
    </Sheet>
  );
}
