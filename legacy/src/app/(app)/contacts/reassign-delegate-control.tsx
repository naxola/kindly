"use client";

import { useState } from "react";
import { assignContactToDelegateAction } from "@/modules/contacts/actions";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { NativeSelect } from "@/components/ui/input";

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
  currentDelegateId,
  delegates,
  onReassigned,
}: {
  contactId: string;
  contactName: string;
  currentDelegateId: string;
  delegates: { userId: string; name: string }[];
  /** For a caller that owns its own data (the Inbox panel) and has to reload it — `/contacts/[id]` relies on the action's `revalidatePath`. */
  onReassigned?: () => void;
}) {
  const [pendingDelegateId, setPendingDelegateId] = useState<string | null>(null);
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
          const result = await assignContactToDelegateAction(contactId, pendingDelegateId!);
          if (result?.error) {
            throw new Error(result.error);
          }
          onReassigned?.();
        }}
      />
    </>
  );
}
