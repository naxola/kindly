"use client";

import { useState } from "react";
import { UserPlus } from "lucide-react";
import { inviteMemberAction } from "@/modules/organizations/actions";
import { useCloseAfterAction } from "@/components/patterns/use-close-after-action";
import { Button } from "@/components/ui/button";
import { SubmitButton } from "@/components/ui/submit-button";
import { Dialog, DialogBody, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Field } from "@/components/ui/field";
import { Input, NativeSelect } from "@/components/ui/input";

/** Alta de invitación: 2 campos, Dialog (docs/ui/COMPONENTS.md §4). */
export function NewMemberDialog() {
  const [open, setOpen] = useState(false);
  const inviteAndClose = useCloseAfterAction(inviteMemberAction, () => setOpen(false));

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="primary" icon={<UserPlus />}>
          Invitar
        </Button>
      </DialogTrigger>
      <DialogContent size="sm">
        <DialogHeader>
          <DialogTitle>Invitar a alguien</DialogTitle>
        </DialogHeader>
        <form action={inviteAndClose} className="contents">
          <DialogBody>
            <Field label="Email">
              <Input type="email" name="email" placeholder="email@ejemplo.com" required />
            </Field>
            <Field
              label="Rol"
              description="Kindly todavía no envía emails: al invitar se genera un enlace que tienes que hacer llegar tú a esa persona. La invitación caduca a los 7 días."
            >
              <NativeSelect name="role" defaultValue="DELEGATE">
                <option value="DELEGATE">DELEGATE</option>
                <option value="ADMIN">ADMIN</option>
              </NativeSelect>
            </Field>
          </DialogBody>
          <DialogFooter>
            <Button onClick={() => setOpen(false)}>Cancelar</Button>
            <SubmitButton>Invitar</SubmitButton>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
