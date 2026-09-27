"use client";

import { useState } from "react";
import { Plus } from "lucide-react";
import { createContactAction } from "@/modules/contacts/actions";
import { useCloseAfterAction } from "@/components/patterns/use-close-after-action";
import { Button } from "@/components/ui/button";
import { SubmitButton } from "@/components/ui/submit-button";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Sheet, SheetBody, SheetContent, SheetFooter, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";

/**
 * Alta de Contact (docs/ui/LAYOUT_NAVIGATION.md §5, regla 3): 4 campos, así
 * que va en Sheet, no en Dialog (docs/ui/COMPONENTS.md §4).
 */
export function NewContactSheet() {
  const [open, setOpen] = useState(false);
  const createAndClose = useCloseAfterAction(createContactAction, () => setOpen(false));

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild>
        <Button variant="primary" icon={<Plus />}>
          Nuevo contacto
        </Button>
      </SheetTrigger>
      <SheetContent size="sm">
        <SheetHeader>
          <SheetTitle>Nuevo contacto</SheetTitle>
        </SheetHeader>
        {/* One <form> around both body and footer, not a `form=""` attribute
            on a detached button: `useFormStatus` inside SubmitButton only
            tracks an ancestor form, not one referenced from outside it. */}
        <form action={createAndClose} className="contents">
          <SheetBody className="flex flex-col gap-4">
            <Field label="Nombre">
              <Input type="text" name="name" required />
            </Field>
            <Field label="Teléfono" optional>
              <Input type="tel" name="phoneE164" placeholder="+34600111222" />
            </Field>
            <Field label="Email" optional>
              <Input type="email" name="email" />
            </Field>
            <Field label="Notas" optional>
              <Input type="text" name="notes" />
            </Field>
          </SheetBody>
          <SheetFooter>
            <Button onClick={() => setOpen(false)}>Cancelar</Button>
            <SubmitButton>Crear contacto</SubmitButton>
          </SheetFooter>
        </form>
      </SheetContent>
    </Sheet>
  );
}
