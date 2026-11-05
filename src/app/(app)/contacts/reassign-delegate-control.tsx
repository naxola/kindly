"use client";

import { useState } from "react";
import { assignContactToDelegateAction } from "@/modules/contacts/actions";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { Field } from "@/components/ui/field";
import { Checkbox, NativeSelect } from "@/components/ui/input";
import { toast } from "@/components/ui/toast";

/**
 * "Reasignar" (PKG-014, ADMIN-only, `docs/DECISIONS.md`). Same shape as
 * `ChangeRoleControl` (`organization/members/change-role-control.tsx`): a
 * `NativeSelect` that shows the picked target immediately and only commits
 * on confirm, reverting on cancel — but with an open set of delegates
 * instead of a binary role, so it takes the target's name for the dialog
 * text rather than deriving it from a fixed copy table.
 */
export function ReassignDelegateControl({
  contactId,
  contactName,
  contactHasEmail,
  currentDelegateId,
  delegates,
  onReassigned,
}: {
  contactId: string;
  contactName: string;
  /** The optional "avisar al afiliado" checkbox only makes sense with an email to send to. */
  contactHasEmail: boolean;
  currentDelegateId: string;
  delegates: { userId: string; name: string }[];
  /** For a caller that owns its own data (the Inbox panel) and has to reload it — `/contacts/[id]` relies on the action's `revalidatePath`. */
  onReassigned?: () => void;
}) {
  const [pendingDelegateId, setPendingDelegateId] = useState<string | null>(null);
  const [notifyContact, setNotifyContact] = useState(false);
  const open = pendingDelegateId !== null && pendingDelegateId !== currentDelegateId;
  const pendingDelegateName = delegates.find((d) => d.userId === pendingDelegateId)?.name;

  return (
    <>
      <NativeSelect
        aria-label={`Delegado de referencia de ${contactName}`}
        value={pendingDelegateId ?? currentDelegateId}
        onChange={(event) => setPendingDelegateId(event.target.value)}
        className="w-auto"
      >
        {delegates.map((delegate) => (
          <option key={delegate.userId} value={delegate.userId}>
            {delegate.name}
          </option>
        ))}
      </NativeSelect>
      <ConfirmDialog
        open={open}
        onOpenChange={(next) => {
          if (!next) {
            setPendingDelegateId(null);
            setNotifyContact(false);
          }
        }}
        title="Reasignar delegado"
        description={
          pendingDelegateName
            ? `¿Hacer a ${pendingDelegateName} el delegado de referencia de ${contactName}? Verá todo su historial; el delegado anterior conserva el suyo, en solo lectura.`
            : undefined
        }
        confirmLabel="Reasignar"
        confirmLoadingLabel="Reasignando…"
        successMessage="Delegado reasignado"
        onConfirm={async () => {
          const result = await assignContactToDelegateAction(contactId, pendingDelegateId!, notifyContact);
          if (result?.error) {
            throw new Error(result.error);
          }
          if (result?.warning) {
            toast.warning(result.warning);
          }
          onReassigned?.();
        }}
      >
        <Field
          layout="horizontal"
          label="Avisar al afiliado por email"
          description={
            contactHasEmail
              ? "Le enviamos la bienvenida con el email y teléfono de su nuevo delegado."
              : "El afiliado no tiene email, no se le puede avisar."
          }
        >
          <Checkbox
            checked={notifyContact && contactHasEmail}
            disabled={!contactHasEmail}
            onChange={(event) => setNotifyContact(event.target.checked)}
          />
        </Field>
      </ConfirmDialog>
    </>
  );
}
