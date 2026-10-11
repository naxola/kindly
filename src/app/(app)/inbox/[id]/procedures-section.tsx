"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { CheckCircle2, Circle } from "lucide-react";
import {
  closeApplicationAction,
  setDocumentReceivedAction,
  startProcedureAction,
  type ProcedureActionResult,
} from "@/modules/procedures/application-actions";
import type { WorkspaceProcedureApplication, WorkspaceProcedures } from "@/app/(app)/inbox/conversation-workspace-types";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { EmptyState } from "@/components/ui/empty-state";
import { NativeSelect } from "@/components/ui/input";
import { cn } from "@/lib/cn";

const dateFormatter = new Intl.DateTimeFormat("es-ES", { day: "numeric", month: "short", year: "numeric" });

function describeReceived(receivedAt: string | null, channel: string | null): string {
  const when = receivedAt ? dateFormatter.format(new Date(receivedAt)) : null;
  return [channel, when].filter(Boolean).join(" · ") || "Recibido";
}

/**
 * "Trámite y documentación" of the ficha (UI-10c, `docs/ui/CONVERSATION_WORKSPACE.md`
 * §5.2): the procedures in progress for this Contact and, for each, which of
 * its required documents have arrived. Only that state is kept — never the
 * files. The delegate marks a document received (or takes it back); the
 * copiloto does not mark anything on its own.
 */
export function ProceduresSection({
  contactId,
  conversationId,
  procedures,
  onMutated,
}: {
  contactId: string;
  conversationId: string;
  procedures: WorkspaceProcedures;
  onMutated: () => void;
}) {
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const [closing, setClosing] = useState<{ application: WorkspaceProcedureApplication; status: "COMPLETED" | "CANCELLED" } | null>(null);

  function run(work: () => Promise<ProcedureActionResult>) {
    setError(null);
    startTransition(async () => {
      const result = await work();
      if (result.error !== null) {
        setError(result.error);
        return;
      }
      onMutated();
    });
  }

  return (
    <div className="flex flex-col gap-3">
      {error && (
        <Alert tone="destructive" live title="No se pudo completar la acción">
          {error}
        </Alert>
      )}

      {procedures.applications.length === 0 ? (
        <EmptyState variant="inline" title="Sin trámite en curso" />
      ) : (
        procedures.applications.map((application) => {
          const received = application.documents.filter((doc) => doc.received).length;
          const total = application.documents.length;
          return (
            <article
              key={application.id}
              className="flex flex-col gap-2.5 rounded-lg border border-border bg-background p-3"
              aria-label={`Trámite ${application.procedureName}`}
            >
              <header className="flex flex-wrap items-center justify-between gap-2">
                <h4 className="type-label font-semibold text-foreground">{application.procedureName}</h4>
                <div className="flex items-center gap-1">
                  <Badge tone="neutral">v{application.version}</Badge>
                  {total > 0 && (
                    <Badge tone={received === total ? "success" : "warning"}>
                      {received} de {total} recibidos
                    </Badge>
                  )}
                </div>
              </header>
              {application.caseTitle && (
                <p className="type-caption text-foreground-lighter">Caso: {application.caseTitle}</p>
              )}

              {total === 0 ? (
                <p className="type-caption text-foreground-lighter">Este trámite no pide documentos.</p>
              ) : (
                <ul className="flex flex-col gap-1.5">
                  {application.documents.map((doc) => (
                    <li key={doc.id} className="flex items-center justify-between gap-2">
                      <div className="flex min-w-0 items-start gap-2">
                        {doc.received ? (
                          <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-success" aria-hidden />
                        ) : (
                          <Circle className="mt-0.5 size-4 shrink-0 text-foreground-lighter" aria-hidden />
                        )}
                        <div className="min-w-0">
                          <p className={cn("type-label", doc.received ? "text-foreground" : "font-medium text-foreground")}>
                            {doc.name}
                          </p>
                          <p className="type-caption text-foreground-lighter">
                            {doc.received ? `Recibido · ${describeReceived(doc.receivedAt, doc.receivedChannel)}` : "Falta"}
                          </p>
                        </div>
                      </div>
                      <Button
                        size="sm"
                        variant="ghost"
                        disabled={pending}
                        aria-label={`${doc.received ? "Deshacer recibido de" : "Marcar como recibido"} ${doc.name}`}
                        onClick={() => run(() => setDocumentReceivedAction(application.id, doc.id, !doc.received, conversationId))}
                      >
                        {doc.received ? "Deshacer" : "Marcar recibido"}
                      </Button>
                    </li>
                  ))}
                </ul>
              )}

              <footer className="flex flex-wrap gap-2 border-t border-border pt-2.5">
                <Button size="sm" variant="outline" disabled={pending} onClick={() => setClosing({ application, status: "COMPLETED" })}>
                  Terminar trámite
                </Button>
                <Button size="sm" variant="ghost" disabled={pending} onClick={() => setClosing({ application, status: "CANCELLED" })}>
                  Cancelar trámite
                </Button>
              </footer>
            </article>
          );
        })
      )}

      {procedures.startable.length > 0 ? (
        <form
          action={(formData) => run(() => startProcedureAction(contactId, formData))}
          className="flex items-center gap-2"
        >
          <NativeSelect name="procedureId" aria-label="Elegir un trámite para iniciar" className="w-auto" defaultValue="">
            <option value="" disabled>
              Iniciar un trámite...
            </option>
            {procedures.startable.map((procedure) => (
              <option key={procedure.id} value={procedure.id}>
                {procedure.name}
              </option>
            ))}
          </NativeSelect>
          <Button type="submit" size="sm" variant="outline" disabled={pending}>
            Iniciar
          </Button>
        </form>
      ) : (
        procedures.applications.length === 0 && (
          <p className="type-caption text-foreground-lighter">
            No hay trámites publicados.{" "}
            <Link href="/knowledge/procedures" className="focus-ring rounded-sm text-primary underline">
              Defínelos en Conocimiento
            </Link>
            .
          </p>
        )
      )}

      <ConfirmDialog
        open={closing !== null}
        onOpenChange={(open) => {
          if (!open) setClosing(null);
        }}
        variant={closing?.status === "CANCELLED" ? "danger" : "default"}
        title={closing?.status === "CANCELLED" ? "Cancelar trámite" : "Terminar trámite"}
        description={
          closing
            ? closing.status === "CANCELLED"
              ? `Se cancelará «${closing.application.procedureName}». Podrás iniciarlo de nuevo más adelante.`
              : closing.application.documents.some((doc) => !doc.received)
                ? `«${closing.application.procedureName}» todavía tiene documentos sin recibir. ¿Terminarlo igualmente?`
                : `Se marcará «${closing.application.procedureName}» como terminado.`
            : undefined
        }
        confirmLabel={closing?.status === "CANCELLED" ? "Cancelar trámite" : "Terminar trámite"}
        cancelLabel="Volver"
        onConfirm={async () => {
          if (!closing) return;
          const result = await closeApplicationAction(closing.application.id, closing.status);
          if (result.error !== null) throw new Error(result.error);
          onMutated();
        }}
      />
    </div>
  );
}
