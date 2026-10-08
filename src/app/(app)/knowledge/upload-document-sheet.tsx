"use client";

import { Plus } from "lucide-react";
import { uploadKnowledgeDocumentAction } from "@/modules/knowledge/actions";
import { UploadForm } from "@/app/(app)/knowledge/upload-form";
import { Button } from "@/components/ui/button";
import { Sheet, SheetBody, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";

/** Alta de conocimiento (solo ADMIN): primero se elige el origen, después sus datos. Al terminar, la acción redirige al documento. */
export function UploadDocumentSheet() {
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
          <UploadForm action={uploadKnowledgeDocumentAction} withDocumentFields submitLabel="Subir documento" />
        </SheetBody>
      </SheetContent>
    </Sheet>
  );
}
