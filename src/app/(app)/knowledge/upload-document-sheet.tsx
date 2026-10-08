"use client";

import { useState } from "react";
import { Plus } from "lucide-react";
import { uploadKnowledgeDocumentAction } from "@/modules/knowledge/actions";
import { UploadForm } from "@/app/(app)/knowledge/upload-form";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { Input, NativeSelect } from "@/components/ui/input";
import { Sheet, SheetBody, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";

type Mode = "SINGLE" | "SITE";

/**
 * Alta de conocimiento (solo ADMIN): primero se elige qué añadir. Un documento
 * o una página se sube aquí mismo (al terminar, la acción redirige al
 * documento); varias páginas de un sitio se buscan y se eligen en `/knowledge/sitio`.
 */
export function UploadDocumentSheet() {
  const [mode, setMode] = useState<Mode>("SINGLE");

  return (
    <Sheet>
      <SheetTrigger asChild>
        <Button variant="primary" icon={<Plus />}>
          Añadir conocimiento
        </Button>
      </SheetTrigger>
      <SheetContent size="sm">
        <SheetHeader>
          <SheetTitle>Añadir conocimiento</SheetTitle>
        </SheetHeader>
        <SheetBody>
          <div className="flex flex-col gap-4">
            <Field label="Qué quieres añadir">
              <NativeSelect value={mode} onChange={(event) => setMode(event.target.value as Mode)}>
                <option value="SINGLE">Un archivo o una página web</option>
                <option value="SITE">Varias páginas de un sitio web</option>
              </NativeSelect>
            </Field>

            {mode === "SINGLE" ? (
              <UploadForm action={uploadKnowledgeDocumentAction} withDocumentFields submitLabel="Subir documento" />
            ) : (
              <form method="get" action="/knowledge/sitio" className="flex flex-col gap-4">
                <Field
                  label="Dirección del sitio"
                  description="Buscaremos sus páginas en el sitemap o el feed RSS y podrás elegir cuáles indexar."
                >
                  <Input type="url" name="url" required placeholder="https://" />
                </Field>
                <div>
                  <Button type="submit" variant="primary">
                    Buscar páginas
                  </Button>
                </div>
              </form>
            )}
          </div>
        </SheetBody>
      </SheetContent>
    </Sheet>
  );
}
