"use client";

import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";

/**
 * Pairs with `useConfirmOnClose` (docs/ui/COMPONENTS.md, "Modalidad"):
 * dismissing it any way other than "Descartar cambios" keeps editing —
 * an accidental `Esc` must never be the thing that throws work away.
 */
export function DiscardChangesDialog({
  open,
  onKeepEditing,
  onDiscard,
}: {
  open: boolean;
  onKeepEditing: () => void;
  onDiscard: () => void;
}) {
  return (
    <Dialog open={open} onOpenChange={(next) => !next && onKeepEditing()}>
      <DialogContent size="sm" showClose={false}>
        <DialogHeader>
          <DialogTitle>¿Descartar los cambios?</DialogTitle>
          <DialogDescription>Lo que has escrito en este formulario se perderá.</DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button onClick={onKeepEditing}>Seguir editando</Button>
          <Button variant="danger" onClick={onDiscard}>
            Descartar cambios
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
