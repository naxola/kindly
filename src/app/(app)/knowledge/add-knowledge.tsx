"use client";

import { useState, useTransition, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { Plus } from "lucide-react";
import { addWebsiteAction, uploadKnowledgeDocumentAction } from "@/modules/knowledge/actions";
import { UploadForm } from "@/app/(app)/knowledge/upload-form";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Dialog, DialogBody, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Field } from "@/components/ui/field";
import { Input, NativeSelect } from "@/components/ui/input";
import { Sheet, SheetBody, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";

type Kind = "WEBSITE" | "DOCUMENT";

const KIND_HELP: Record<Kind, string> = {
  WEBSITE: "Usa un sitio web para que la IA pueda citar sus páginas.",
  DOCUMENT: "Sube un PDF o un texto para que la IA pueda citarlo.",
};

/**
 * "Añadir conocimiento" (solo ADMIN). Un diálogo corto pregunta qué se añade;
 * después se abre el panel de la derecha de ese tipo: el del sitio web (con
 * sus páginas y ajustes, ya creado) o el formulario de un documento.
 */
export function AddKnowledge() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [documentOpen, setDocumentOpen] = useState(false);
  const [kind, setKind] = useState<Kind>("WEBSITE");
  const [url, setUrl] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function handleOpenChange(next: boolean) {
    if (pending) return;
    setOpen(next);
    if (!next) setError(null);
  }

  function submit(event: FormEvent) {
    event.preventDefault();
    if (kind === "DOCUMENT") {
      setOpen(false);
      setDocumentOpen(true);
      return;
    }
    setError(null);
    startTransition(async () => {
      const result = await addWebsiteAction(url);
      if (result.error !== null) {
        setError(result.error);
        return;
      }
      setOpen(false);
      setUrl("");
      router.push(`/knowledge?sitio=${result.websiteId}`, { scroll: false });
    });
  }

  return (
    <>
      <Button variant="primary" icon={<Plus />} onClick={() => setOpen(true)}>
        Añadir conocimiento
      </Button>

      <Dialog open={open} onOpenChange={handleOpenChange}>
        <DialogContent size="md">
          <form onSubmit={submit}>
            <DialogHeader>
              <DialogTitle>Añadir conocimiento</DialogTitle>
              <DialogDescription>Elige qué quieres añadir a la base de conocimiento.</DialogDescription>
            </DialogHeader>
            <DialogBody>
              {error && (
                <Alert tone="destructive" live title="No se pudo añadir el sitio web">
                  {error}
                </Alert>
              )}
              <Field label="Tipo de conocimiento" description={KIND_HELP[kind]}>
                <NativeSelect value={kind} onChange={(event) => setKind(event.target.value as Kind)}>
                  <option value="WEBSITE">Sitio web</option>
                  <option value="DOCUMENT">Documento</option>
                </NativeSelect>
              </Field>
              {kind === "WEBSITE" && (
                <Field
                  label="Dirección del sitio web"
                  description="Buscaremos sus páginas en el sitemap o el feed RSS y podrás elegir cuáles indexar."
                >
                  <Input
                    type="url"
                    value={url}
                    onChange={(event) => setUrl(event.target.value)}
                    required
                    placeholder="https://"
                  />
                </Field>
              )}
            </DialogBody>
            <DialogFooter>
              <Button type="button" variant="ghost" onClick={() => handleOpenChange(false)} disabled={pending}>
                Cancelar
              </Button>
              <Button type="submit" variant="primary" loading={pending} loadingText="Leyendo el sitio…">
                {kind === "WEBSITE" ? "Añadir sitio web" : "Continuar"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <Sheet open={documentOpen} onOpenChange={setDocumentOpen}>
        <SheetContent size="sm">
          <SheetHeader>
            <SheetTitle>Añadir documento</SheetTitle>
          </SheetHeader>
          <SheetBody>
            <UploadForm
              action={uploadKnowledgeDocumentAction}
              withDocumentFields
              submitLabel="Subir documento"
              origins={["PDF", "TEXT"]}
            />
          </SheetBody>
        </SheetContent>
      </Sheet>
    </>
  );
}
