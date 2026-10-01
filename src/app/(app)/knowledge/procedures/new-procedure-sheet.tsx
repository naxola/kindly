"use client";

import { useState } from "react";
import { Plus } from "lucide-react";
import { createProcedureAction } from "@/modules/procedures/actions";
import { useCloseAfterAction } from "@/components/patterns/use-close-after-action";
import { Button } from "@/components/ui/button";
import { SubmitButton } from "@/components/ui/submit-button";
import { Field } from "@/components/ui/field";
import { Input, Textarea } from "@/components/ui/input";
import { Sheet, SheetBody, SheetContent, SheetFooter, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";

/** Alta de trámite (solo ADMIN): nombre + pasos y documentos, uno por línea. */
export function NewProcedureSheet() {
  const [open, setOpen] = useState(false);
  const createAndClose = useCloseAfterAction(createProcedureAction, () => setOpen(false));

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild>
        <Button variant="primary" icon={<Plus />}>
          Nuevo trámite
        </Button>
      </SheetTrigger>
      <SheetContent size="sm">
        <SheetHeader>
          <SheetTitle>Nuevo trámite</SheetTitle>
        </SheetHeader>
        <form action={createAndClose} className="contents">
          <SheetBody className="flex flex-col gap-4">
            <Field label="Nombre">
              <Input type="text" name="name" required />
            </Field>
            <Field label="Descripción" optional>
              <Textarea name="description" rows={2} />
            </Field>
            <Field label="Pasos" optional description="Uno por línea, en orden.">
              <Textarea name="steps" rows={4} />
            </Field>
            <Field label="Documentos requeridos" optional description="Uno por línea.">
              <Textarea name="requiredDocuments" rows={4} />
            </Field>
          </SheetBody>
          <SheetFooter>
            <Button onClick={() => setOpen(false)}>Cancelar</Button>
            <SubmitButton>Crear trámite</SubmitButton>
          </SheetFooter>
        </form>
      </SheetContent>
    </Sheet>
  );
}
