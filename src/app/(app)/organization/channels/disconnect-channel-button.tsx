"use client";

import { useState } from "react";
import { disconnectMessagingAccountAction } from "@/modules/messaging/actions";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";

/**
 * Disconnecting a channel is consequential (mensajes dejan de sincronizarse)
 * so it goes through the app's one confirmation component (UI-4,
 * docs/ui/LAYOUT_NAVIGATION.md §5) instead of submitting on the first click,
 * as it did before this pass.
 */
export function DisconnectChannelButton({ accountId }: { accountId: string }) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <Button variant="ghost" size="sm" onClick={() => setOpen(true)}>
        Desconectar
      </Button>
      <ConfirmDialog
        open={open}
        onOpenChange={setOpen}
        title="Desconectar canal"
        description="Este canal dejará de sincronizar mensajes."
        confirmLabel="Desconectar"
        confirmLoadingLabel="Desconectando…"
        variant="danger"
        successMessage="Canal desconectado"
        onConfirm={() => disconnectMessagingAccountAction(accountId)}
      />
    </>
  );
}
