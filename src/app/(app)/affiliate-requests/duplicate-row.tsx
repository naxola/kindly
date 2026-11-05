"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { applyDuplicateRequestAction, discardAffiliateRequestAction } from "@/modules/affiliates/actions";
import type { RequestView } from "@/app/(app)/affiliate-requests/types";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { RelativeTime } from "@/components/ui/relative-time";
import { TableCell, TableRow } from "@/components/ui/table";

export function DuplicateRow({ request }: { request: RequestView }) {
  const [dialog, setDialog] = useState<"apply" | "discard" | null>(null);
  const router = useRouter();
  const name = `${request.data.firstName} ${request.data.lastName}`;

  return (
    <TableRow>
      <TableCell>
        <p className="font-medium text-foreground">{name}</p>
        <p className="type-caption text-foreground-lighter">{request.data.dni}</p>
      </TableCell>
      <TableCell className="text-foreground-lighter">{request.duplicateOfName ?? "—"}</TableCell>
      <TableCell className="text-foreground-lighter">
        <RelativeTime date={request.receivedAt} />
      </TableCell>
      <TableCell>
        <div className="flex justify-end gap-2">
          <Button size="sm" onClick={() => setDialog("apply")}>
            Actualizar datos
          </Button>
          <Button size="sm" variant="ghost" onClick={() => setDialog("discard")}>
            Descartar
          </Button>
        </div>
        <ConfirmDialog
          open={dialog === "apply"}
          onOpenChange={(open) => !open && setDialog(null)}
          title="Actualizar los datos del afiliado"
          description={`Se sobrescribirán los datos de ${request.duplicateOfName ?? "este afiliado"} con los del alta recibida. Su delegado no cambia.`}
          confirmLabel="Actualizar datos"
          successMessage="Datos actualizados"
          onConfirm={async () => {
            const result = await applyDuplicateRequestAction(request.id);
            if (!result.ok) throw new Error(result.error);
            router.refresh();
          }}
        />
        <ConfirmDialog
          open={dialog === "discard"}
          onOpenChange={(open) => !open && setDialog(null)}
          title="Descartar el alta"
          description="No se guarda nada: el afiliado existente se queda como está."
          confirmLabel="Descartar alta"
          variant="danger"
          successMessage="Alta descartada"
          onConfirm={async () => {
            const result = await discardAffiliateRequestAction(request.id);
            if (!result.ok) throw new Error(result.error);
            router.refresh();
          }}
        />
      </TableCell>
    </TableRow>
  );
}
