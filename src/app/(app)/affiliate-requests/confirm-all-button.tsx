"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { confirmAllAffiliateRequestsAction } from "@/modules/affiliates/actions";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";

export function ConfirmAllButton({ count }: { count: number }) {
  const [open, setOpen] = useState(false);
  const router = useRouter();

  return (
    <>
      <Button onClick={() => setOpen(true)}>Confirmar todas con la propuesta</Button>
      <ConfirmDialog
        open={open}
        onOpenChange={setOpen}
        title="Confirmar todas las propuestas"
        description={`Se asignarán ${count} afiliados a los delegados propuestos. Cada asignación se puede cambiar después desde la ficha del contacto.`}
        confirmLabel="Confirmar todas"
        successMessage="Altas asignadas"
        onConfirm={async () => {
          const result = await confirmAllAffiliateRequestsAction();
          if (!result.ok) throw new Error(result.error);
          router.refresh();
        }}
      />
    </>
  );
}
