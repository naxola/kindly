"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { continueSiteImportAction, retryFailedImportAction } from "@/modules/knowledge/actions";
import { Alert } from "@/components/ui/alert";
import { Spinner } from "@/components/ui/spinner";
import { SubmitButton } from "@/components/ui/submit-button";

const IDLE_WAIT_MS = 3000;

/**
 * Keeps the import moving while the page is open: each call indexes one more
 * time-boxed slice (`continueSiteImportAction`), then the list is refreshed.
 * The first slice already ran after the request that queued the batch; this
 * is what finishes a long import when that slice hit the function's limit.
 */
export function ImportProgress({
  batchId,
  waiting,
  failed,
  total,
}: {
  batchId: string;
  /** Pages still PENDING or INDEXING. */
  waiting: number;
  failed: number;
  total: number;
}) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const running = useRef(false);

  useEffect(() => {
    if (waiting === 0 || running.current) return;
    running.current = true;
    let cancelled = false;

    (async () => {
      while (!cancelled) {
        const result = await continueSiteImportAction(batchId);
        if (cancelled) return;
        if (result.error) {
          setError(result.error);
          break;
        }
        router.refresh();
        if (result.remaining === 0) break;
        // Pages left but none claimable: another slice (the one that started the import) is still running.
        await new Promise((resolve) => setTimeout(resolve, IDLE_WAIT_MS));
      }
      running.current = false;
    })();

    return () => {
      cancelled = true;
      running.current = false;
    };
  }, [batchId, waiting, router]);

  return (
    <div className="flex flex-col gap-3">
      {waiting > 0 ? (
        <p className="type-body flex items-center gap-2 text-foreground-lighter" role="status">
          <Spinner />
          Indexando… {total - waiting} de {total} páginas procesadas. Puedes salir de esta pantalla: la importación continúa
          mientras esté abierta y se retoma al volver.
        </p>
      ) : (
        <p className="type-body text-foreground-lighter" role="status">
          Importación terminada.
        </p>
      )}
      {error && (
        <Alert tone="destructive" title="La importación se ha detenido">
          {error}
        </Alert>
      )}
      {failed > 0 && waiting === 0 && (
        <form action={retryFailedImportAction.bind(null, batchId)}>
          <SubmitButton variant="outline">
            Reintentar {failed} {failed === 1 ? "página con error" : "páginas con error"}
          </SubmitButton>
        </form>
      )}
    </div>
  );
}
