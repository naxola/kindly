"use client";

import { useActionState, useState } from "react";
import type { UploadFormState } from "@/modules/knowledge/actions";
import { Alert } from "@/components/ui/alert";
import { Field } from "@/components/ui/field";
import { Input, NativeSelect } from "@/components/ui/input";
import { SubmitButton } from "@/components/ui/submit-button";

type Origin = "PDF" | "TEXT" | "WEB";

/**
 * Shared by "Añadir conocimiento" (new document: also asks for title/ámbito) and
 * "Nueva versión" (existing document). The server action owns validation and
 * returns what is wrong, shown inline — no throw (`actions.ts`).
 */
export function UploadForm({
  action,
  withDocumentFields,
  submitLabel,
}: {
  action: (previous: UploadFormState, formData: FormData) => Promise<UploadFormState>;
  withDocumentFields: boolean;
  submitLabel: string;
}) {
  const [state, formAction] = useActionState(action, { error: null });
  const values = state.values ?? {};
  const [origin, setOrigin] = useState<Origin>((values.origin as Origin | undefined) ?? "PDF");

  return (
    <form action={formAction} className="flex flex-col gap-4">
      {state.error && (
        <Alert tone="destructive" live title="No se pudo subir el documento">
          {state.error}
        </Alert>
      )}

      <Field label="Origen" description="Qué quieres que la IA pueda citar.">
        <NativeSelect name="origin" value={origin} onChange={(event) => setOrigin(event.target.value as Origin)}>
          <option value="PDF">Archivo PDF</option>
          <option value="TEXT">Archivo de texto (.txt, .md)</option>
          <option value="WEB">Página web</option>
        </NativeSelect>
      </Field>

      {withDocumentFields && (
        <>
          <Field label="Título">
            <Input type="text" name="title" defaultValue={values.title} required />
          </Field>
          <Field label="Jurisdicción" optional description="Por ejemplo: ES.">
            <Input type="text" name="jurisdiction" defaultValue={values.jurisdiction} />
          </Field>
          <Field label="Territorio" optional>
            <Input type="text" name="territory" defaultValue={values.territory} />
          </Field>
          <Field label="Ámbito" optional>
            <Input type="text" name="scope" defaultValue={values.scope} />
          </Field>
        </>
      )}

      {origin === "WEB" ? (
        <Field label="Dirección web" description="Solo se guarda el texto, no la página.">
          <Input type="url" name="url" defaultValue={values.url} required placeholder="https://" />
        </Field>
      ) : (
        <Field
          label="Archivo"
          description="PDF de hasta 4 MB, o texto UTF-8 de hasta 2 MB. Solo se guarda el texto extraído, no el archivo."
        >
          <Input
            type="file"
            name="file"
            required
            accept={origin === "PDF" ? "application/pdf,.pdf" : ".txt,.md,text/plain,text/markdown"}
          />
        </Field>
      )}

      <Field label="Versión" description="Por ejemplo: 2024 o 1.0.">
        <Input type="text" name="version" defaultValue={values.version} required />
      </Field>
      <Field label="En vigor desde">
        <Input type="date" name="effectiveFrom" defaultValue={values.effectiveFrom} required />
      </Field>
      <Field label="En vigor hasta" optional description="Déjalo vacío si sigue vigente.">
        <Input type="date" name="effectiveUntil" defaultValue={values.effectiveUntil} />
      </Field>
      <Field label="Nota de fuente" optional description="Por ejemplo: BOE núm. 5, de 2024-01-10.">
        <Input type="text" name="sourceNote" defaultValue={values.sourceNote} />
      </Field>
      <Field label="Estado" description="Un borrador no se usa en las búsquedas.">
        <NativeSelect name="status" defaultValue={values.status ?? "CURRENT"}>
          <option value="CURRENT">Vigente</option>
          <option value="DRAFT">Borrador</option>
        </NativeSelect>
      </Field>

      <div>
        <SubmitButton>{submitLabel}</SubmitButton>
      </div>
    </form>
  );
}
