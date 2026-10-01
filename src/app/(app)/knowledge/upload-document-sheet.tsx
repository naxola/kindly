"use client";

import { Upload } from "lucide-react";
import { uploadKnowledgeDocumentAction } from "@/modules/knowledge/actions";
import { UploadForm } from "@/app/(app)/knowledge/upload-form";
import { Button } from "@/components/ui/button";
import { Sheet, SheetBody, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";

/** Alta de documento (solo ADMIN). Al terminar, la acción redirige al documento. */
export function UploadDocumentSheet() {
  return (
    <Sheet>
      <SheetTrigger asChild>
        <Button variant="primary" icon={<Upload />}>
          Subir documento
        </Button>
      </SheetTrigger>
      <SheetContent size="sm">
        <SheetHeader>
          <SheetTitle>Subir documento</SheetTitle>
        </SheetHeader>
        <SheetBody>
          <UploadForm action={uploadKnowledgeDocumentAction} withDocumentFields submitLabel="Subir documento" />
        </SheetBody>
      </SheetContent>
    </Sheet>
  );
}
