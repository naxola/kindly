"use client";

import { useState } from "react";
import { Plus } from "lucide-react";
import { createContactAction } from "@/modules/contacts/actions";
import { useCloseAfterAction } from "@/components/patterns/use-close-after-action";
import { Button } from "@/components/ui/button";
import { SubmitButton } from "@/components/ui/submit-button";
import { Field } from "@/components/ui/field";
import { Checkbox, Input, NativeSelect } from "@/components/ui/input";
import { Sheet, SheetBody, SheetContent, SheetFooter, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";

/**
 * Alta de Contact (docs/ui/LAYOUT_NAVIGATION.md §5, regla 3): pocos campos,
 * así que va en Sheet, no en Dialog (docs/ui/COMPONENTS.md §4).
 *
 * `delegates` solo llega con contenido para un ADMIN, que es quien puede
 * elegir otro delegado de referencia; un DELEGATE queda como delegado de
 * sus propios afiliados y no ve el selector (el servidor lo vuelve a exigir).
 */
export function NewContactSheet({
  delegates,
  defaultDelegateId,
}: {
  delegates: { userId: string; name: string }[];
  defaultDelegateId: string;
}) {
  const [open, setOpen] = useState(false);
  const [email, setEmail] = useState("");
  const hasEmail = email.trim() !== "";
  const createAndClose = useCloseAfterAction(createContactAction, () => {
    setOpen(false);
    setEmail("");
  });

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
              <Input type="email" name="email" value={email} onChange={(event) => setEmail(event.target.value)} />
            </Field>
            <Field label="Notas" optional>
              <Input type="text" name="notes" />
            </Field>
            {delegates.length > 0 && (
              <Field label="Delegado de referencia" description="Quién atenderá a este afiliado.">
                <NativeSelect name="delegateId" defaultValue={defaultDelegateId}>
                  {delegates.map((delegate) => (
                    <option key={delegate.userId} value={delegate.userId}>
                      {delegate.name}
                    </option>
                  ))}
                </NativeSelect>
              </Field>
            )}
            <Field
              layout="horizontal"
              label="Enviar email de bienvenida"
              description={
                hasEmail
                  ? "Le presentamos a su delegado, con su email y teléfono."
                  : "Añade un email al afiliado para poder enviarle la bienvenida."
              }
            >
              <Checkbox name="sendWelcome" disabled={!hasEmail} />
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
