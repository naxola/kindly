"use client";

import { useActionState, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  deleteWebsiteAction,
  refreshWebsitePagesAction,
  reindexWebsiteAction,
  updateWebsiteSettingsAction,
  type WebsiteSettingsState,
} from "@/modules/knowledge/actions";
import type { WebsiteView } from "@/app/(app)/knowledge/website-sheet";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { Field } from "@/components/ui/field";
import { Checkbox, Input, NativeSelect } from "@/components/ui/input";
import { SubmitButton } from "@/components/ui/submit-button";

export function WebsiteSettingsTab({ website }: { website: WebsiteView }) {
  const router = useRouter();
  const [state, formAction] = useActionState<WebsiteSettingsState, FormData>(
    updateWebsiteSettingsAction.bind(null, website.id),
    { error: null, saved: false },
  );
  const [notice, setNotice] = useState<{ tone: "success" | "destructive"; text: string } | null>(null);
  const [pending, startTransition] = useTransition();
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [alsoDocuments, setAlsoDocuments] = useState(false);

  const options = website.options;
  const indexedDocuments = website.pages.filter((page) => page.documentId).length;

  function maintain(work: () => Promise<{ error: string | null; message?: string }>) {
    setNotice(null);
    startTransition(async () => {
      const result = await work();
      setNotice(
        result.error === null
          ? { tone: "success", text: result.message ?? "Hecho." }
          : { tone: "destructive", text: result.error },
      );
      router.refresh();
    });
  }

  async function remove() {
    const result = await deleteWebsiteAction(website.id, alsoDocuments);
    if (result.error !== null) throw new Error(result.error);
    router.replace("/knowledge", { scroll: false });
  }

  return (
    <div className="flex flex-col gap-8">
      <form action={formAction} className="flex flex-col gap-4">
        <input type="hidden" name="origin" value="WEB" />
        <input type="hidden" name="url" value={website.url} />
        <div>
          <h3 className="type-section-title text-foreground">Datos de publicación</h3>
          <p className="type-body text-foreground-lighter">
            Se usan en las páginas que indexes a partir de ahora; los documentos ya indexados conservan los suyos.
          </p>
        </div>

        {state.error && (
          <Alert tone="destructive" live title="No se pudieron guardar los cambios">
            {state.error}
          </Alert>
        )}
        {state.saved && (
          <Alert tone="success" live>
            Cambios guardados.
          </Alert>
        )}

        <Field label="Versión" description="Por ejemplo: 2024 o la fecha de consulta.">
          <Input type="text" name="version" defaultValue={options.version} required />
        </Field>
        <Field label="En vigor desde">
          <Input type="date" name="effectiveFrom" defaultValue={options.effectiveFrom} required />
        </Field>
        <Field label="En vigor hasta" optional description="Déjalo vacío si sigue vigente.">
          <Input type="date" name="effectiveUntil" defaultValue={options.effectiveUntil ?? ""} />
        </Field>
        <Field label="Nota de fuente" optional description="Se muestra con cada cita de la IA.">
          <Input type="text" name="sourceNote" defaultValue={options.sourceNote ?? ""} />
        </Field>
        <Field label="Jurisdicción" optional description="Por ejemplo: ES.">
          <Input type="text" name="jurisdiction" defaultValue={options.jurisdiction ?? ""} />
        </Field>
        <Field label="Territorio" optional>
          <Input type="text" name="territory" defaultValue={options.territory ?? ""} />
        </Field>
        <Field label="Ámbito" optional>
          <Input type="text" name="scope" defaultValue={options.scope ?? ""} />
        </Field>
        <Field label="Estado" description="Un borrador no se usa en las búsquedas.">
          <NativeSelect name="status" defaultValue={options.status}>
            <option value="CURRENT">Vigente</option>
            <option value="DRAFT">Borrador</option>
          </NativeSelect>
        </Field>
        <div>
          <SubmitButton>Guardar cambios</SubmitButton>
        </div>
      </form>

      <section className="flex flex-col gap-3 border-t border-border pt-6" aria-labelledby="website-maintenance">
        <div>
          <h3 id="website-maintenance" className="type-section-title text-foreground">
            Mantenimiento
          </h3>
          <p className="type-body text-foreground-lighter">
            Busca páginas nuevas del sitio o vuelve a calcular los vectores con el proveedor de IA activo.
          </p>
        </div>
        {notice && (
          <Alert tone={notice.tone} live>
            {notice.text}
          </Alert>
        )}
        <div className="flex flex-wrap gap-2">
          <Button
            variant="outline"
            disabled={pending}
            onClick={() =>
              maintain(async () => {
                const result = await refreshWebsitePagesAction(website.id);
                if (result.error !== null) return result;
                return {
                  error: null,
                  message: result.added === 0 ? "No hay páginas nuevas." : `Se han añadido ${result.added} páginas nuevas.`,
                };
              })
            }
          >
            Volver a buscar páginas
          </Button>
          <Button
            variant="outline"
            disabled={pending || indexedDocuments === 0}
            onClick={() =>
              maintain(async () => {
                const result = await reindexWebsiteAction(website.id);
                if (result.error !== null) return result;
                return {
                  error: null,
                  message:
                    result.reembedded === 0
                      ? "Todo estaba al día."
                      : `Reindexados ${result.reembedded} fragmentos de ${result.documents} documentos.`,
                };
              })
            }
          >
            Reindexar documentos
          </Button>
        </div>
      </section>

      <section
        className="flex flex-col gap-3 rounded-card border border-destructive-border p-4"
        aria-labelledby="website-danger"
      >
        <div>
          <h3 id="website-danger" className="type-section-title text-destructive">
            Zona de peligro
          </h3>
          <p className="type-body text-foreground-lighter">
            Quitar el sitio web borra su lista de páginas. Los documentos ya indexados se conservan salvo que elijas lo
            contrario.
          </p>
        </div>
        <div>
          <Button variant="danger" onClick={() => setConfirmOpen(true)}>
            Eliminar sitio web
          </Button>
        </div>
      </section>

      <ConfirmDialog
        open={confirmOpen}
        onOpenChange={setConfirmOpen}
        variant="danger"
        title="Eliminar sitio web"
        description={`Se quitará ${new URL(website.url).host} y su lista de páginas.`}
        confirmLabel="Eliminar sitio web"
        confirmLoadingLabel="Eliminando…"
        successMessage="Sitio web eliminado"
        onConfirm={remove}
      >
        {indexedDocuments > 0 && (
          <label className="type-body flex items-start gap-2 text-foreground">
            <Checkbox checked={alsoDocuments} onChange={(event) => setAlsoDocuments(event.target.checked)} className="mt-0.5" />
            <span>
              También eliminar los {indexedDocuments} {indexedDocuments === 1 ? "documento indexado" : "documentos indexados"}{" "}
              desde este sitio. La IA dejará de poder citarlos.
            </span>
          </label>
        )}
      </ConfirmDialog>
    </div>
  );
}
