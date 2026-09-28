"use client";

import { useState } from "react";
import { revokeInvitationAction } from "@/modules/organizations/actions";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";

export function RevokeInvitationButton({ invitationId, email }: { invitationId: string; email: string }) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <Button variant="ghost" size="sm" onClick={() => setOpen(true)}>
        Revocar
      </Button>
      <ConfirmDialog
        open={open}
        onOpenChange={setOpen}
        title="Revocar invitación"
        description={`El enlace enviado a ${email} dejará de funcionar.`}
        confirmLabel="Revocar invitación"
        variant="danger"
        successMessage="Invitación revocada"
        onConfirm={() => revokeInvitationAction(invitationId)}
      />
    </>
  );
}
