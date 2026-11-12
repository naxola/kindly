"use client";

import { useState } from "react";
import { changeMemberRoleAction } from "@/modules/organizations/actions";
import type { OrganizationRole } from "@/modules/organizations/schema";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { NativeSelect } from "@/components/ui/input";

const ROLE_CHANGE_COPY: Record<OrganizationRole, string> = {
  ADMIN: "Podrá invitar miembros y ver los canales de toda la organización.",
  DELEGATE: "Dejará de poder invitar miembros y de ver los canales de toda la organización.",
};

/**
 * `NativeSelect` in the row + `ConfirmDialog` (ORGANIZATION.md §4, approved
 * 2026-09-26). Only two roles exist, so selecting the other one is the only
 * possible change — the select shows the target role immediately and reverts
 * on cancel, matching `currentRole` again once the dialog closes without a
 * successful confirm.
 */
export function ChangeRoleControl({
  userId,
  memberName,
  currentRole,
}: {
  userId: string;
  memberName: string;
  currentRole: OrganizationRole;
}) {
  const [pendingRole, setPendingRole] = useState<OrganizationRole | null>(null);
  const open = pendingRole !== null && pendingRole !== currentRole;

  return (
    <>
      <NativeSelect
        aria-label={`Rol de ${memberName}`}
        value={pendingRole ?? currentRole}
        onChange={(event) => setPendingRole(event.target.value as OrganizationRole)}
        className="w-auto"
      >
        <option value="DELEGATE">DELEGATE</option>
        <option value="ADMIN">ADMIN</option>
      </NativeSelect>
      <ConfirmDialog
        open={open}
        onOpenChange={(next) => {
          if (!next) {
            setPendingRole(null);
          }
        }}
        title="Cambiar rol"
        description={
          pendingRole
            ? `¿Cambiar el rol de ${memberName} a ${pendingRole}? ${ROLE_CHANGE_COPY[pendingRole]}`
            : undefined
        }
        confirmLabel="Cambiar rol"
        confirmLoadingLabel="Cambiando…"
        successMessage="Rol actualizado"
        onConfirm={async () => {
          const result = await changeMemberRoleAction(userId, pendingRole!);
          if (result?.error) {
            throw new Error(result.error);
          }
        }}
      />
    </>
  );
}
