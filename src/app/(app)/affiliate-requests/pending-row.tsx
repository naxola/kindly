"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { confirmAffiliateRequestAction, discardAffiliateRequestAction } from "@/modules/affiliates/actions";
import { formatAddress, formatFee, formatIsoDate } from "@/modules/affiliates/format";
import type { DelegateLoad } from "@/modules/affiliates/proposal";
import type { RequestView } from "@/app/(app)/affiliate-requests/types";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { RelativeTime } from "@/components/ui/relative-time";
import { Sheet, SheetBody, SheetContent, SheetDescription, SheetFooter, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { cn } from "@/lib/cn";

export function PendingRow({
  request,
  delegates,
  proposedName,
}: {
  request: RequestView;
  delegates: DelegateLoad[];
  proposedName: string | null;
}) {
  const [open, setOpen] = useState(false);
  const [discarding, setDiscarding] = useState(false);
  const [selected, setSelected] = useState<string | null>(request.proposedDelegateId);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();
  const { data } = request;
  const name = `${data.firstName} ${data.lastName}`;

  async function confirm() {
    if (!selected) return;
    setPending(true);
    setError(null);
    const result = await confirmAffiliateRequestAction(request.id, selected);
    setPending(false);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    setOpen(false);
    router.refresh();
  }

  return (
    <TableRow>
      <TableCell>
        <p className="font-medium text-foreground">{name}</p>
        <p className="type-caption text-foreground-lighter">{data.dni}</p>
      </TableCell>
      <TableCell className="text-foreground-lighter">{data.workplace ?? "—"}</TableCell>
      <TableCell className="text-foreground-lighter">
        <RelativeTime date={request.receivedAt} />
      </TableCell>
      <TableCell>{proposedName ? <Badge tone="primary">{proposedName}</Badge> : <Badge tone="warning">Sin propuesta</Badge>}</TableCell>
      <TableCell>
        <div className="flex justify-end">
          <Button size="sm" variant="primary" onClick={() => setOpen(true)}>
            Revisar
          </Button>
        </div>

        <Sheet open={open} onOpenChange={(next) => !pending && setOpen(next)}>
          <SheetContent size="md">
            <SheetHeader>
              <SheetTitle>{name}</SheetTitle>
              <SheetDescription>Elige quién se queda con este afiliado</SheetDescription>
            </SheetHeader>
            <SheetBody className="flex flex-col gap-6">
              <section aria-labelledby={`delegates-${request.id}`} className="flex flex-col gap-2">
                <h3 id={`delegates-${request.id}`} className="type-label text-foreground">
                  Delegado
                </h3>
                {delegates.length === 0 ? (
                  <Alert tone="warning">No hay delegados a quienes asignar.</Alert>
                ) : (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Delegado</TableHead>
                        <TableHead className="text-right">Afiliados</TableHead>
                        <TableHead className="text-right">Por confirmar</TableHead>
                        <TableHead className="text-right">Con esta alta</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {delegates.map((delegate) => {
                        // This alta is already counted as pending for its proposed delegate.
                        const others = delegate.pending - (delegate.userId === request.proposedDelegateId ? 1 : 0);
                        const inputId = `delegate-${request.id}-${delegate.userId}`;
                        return (
                          <TableRow key={delegate.userId} className={cn(selected === delegate.userId && "bg-state-selected")}>
                            <TableCell>
                              <label htmlFor={inputId} className="flex cursor-pointer items-center gap-2 font-medium text-foreground">
                                <input
                                  id={inputId}
                                  type="radio"
                                  name={`delegate-${request.id}`}
                                  value={delegate.userId}
                                  checked={selected === delegate.userId}
                                  onChange={() => setSelected(delegate.userId)}
                                  className="size-4 shrink-0 cursor-pointer accent-primary focus-ring"
                                />
                                {delegate.name}
                                {delegate.userId === request.proposedDelegateId && <Badge tone="primary">Propuesto</Badge>}
                              </label>
                            </TableCell>
                            <TableCell className="text-right tabular-nums">{delegate.assigned}</TableCell>
                            <TableCell className="text-right tabular-nums">{others}</TableCell>
                            <TableCell className="text-right tabular-nums">{delegate.assigned + others + 1}</TableCell>
                          </TableRow>
                        );
                      })}
                    </TableBody>
                  </Table>
                )}
                <p className="type-caption text-foreground-lighter">
                  «Por confirmar» son las altas que ya tienen a ese delegado propuesto. El orden de desempate es el de entrada a la
                  organización.
                </p>
              </section>

              <section aria-labelledby={`data-${request.id}`} className="flex flex-col gap-3">
                <h3 id={`data-${request.id}`} className="type-label text-foreground">
                  Datos recibidos
                </h3>
                <div className="grid gap-x-4 gap-y-3 sm:grid-cols-2">
                  <Datum label="DNI / NIE" value={data.dni} />
                  <Datum label="Fecha de nacimiento" value={formatIsoDate(data.birthDate)} />
                  <Datum label="Género" value={data.gender} />
                  <Datum label="Teléfono" value={data.phoneE164} />
                  <Datum label="Email" value={data.email} />
                  <Datum label="Cuota mensual" value={formatFee(data.monthlyFeeCents)} />
                  <Datum label="Sector" value={data.sector} />
                  <Datum label="Situación laboral" value={data.employmentStatus} />
                  <Datum label="Centro de trabajo" value={data.workplace} />
                  <Datum label="Provincia de trabajo" value={data.workplaceProvince} />
                </div>
                <Datum label="Domicilio" value={formatAddress(data.address)} />
              </section>

              {error && (
                <Alert tone="destructive" live>
                  {error}
                </Alert>
              )}
            </SheetBody>
            <SheetFooter>
              <Button variant="ghost" onClick={() => setDiscarding(true)} disabled={pending}>
                Descartar alta
              </Button>
              <Button variant="primary" onClick={confirm} loading={pending} loadingText="Asignando…" disabled={!selected}>
                Confirmar asignación
              </Button>
            </SheetFooter>
          </SheetContent>
        </Sheet>

        <ConfirmDialog
          open={discarding}
          onOpenChange={setDiscarding}
          title="Descartar el alta"
          description={`Se elimina el contacto creado para ${name} y no se asigna a nadie. Si ya tuviera conversaciones o casos, el contacto se conserva.`}
          confirmLabel="Descartar alta"
          variant="danger"
          successMessage="Alta descartada"
          onConfirm={async () => {
            const result = await discardAffiliateRequestAction(request.id);
            if (!result.ok) throw new Error(result.error);
            setOpen(false);
            router.refresh();
          }}
        />
      </TableCell>
    </TableRow>
  );
}

function Datum({ label, value }: { label: string; value: string | null }) {
  return (
    <div className="flex min-w-0 flex-col gap-0.5">
      <p className="type-caption text-foreground-lighter">{label}</p>
      <p className="type-body break-words text-foreground">{value || "—"}</p>
    </div>
  );
}
