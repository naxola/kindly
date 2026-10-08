"use client";

import { useActionState, useState } from "react";
import { startSiteImportAction, type UploadFormState } from "@/modules/knowledge/actions";
import { MAX_IMPORT_PAGES } from "@/modules/knowledge/source-status";
import { formatDay } from "@/app/(app)/knowledge/labels";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { Checkbox, Input, NativeSelect } from "@/components/ui/input";
import { SubmitButton } from "@/components/ui/submit-button";
import { Table, TableBody, TableCell, TableEmpty, TableHead, TableHeader, TableRow } from "@/components/ui/table";

export interface CandidatePage {
  url: string;
  title: string | null;
  lastModified: string | null;
  /** Set when the organization already has this page as a document. */
  existingDocumentId: string | null;
}

const normalize = (value: string) => value.normalize("NFD").replace(/\p{Diacritic}/gu, "").toLowerCase();

function formatModified(value: string | null): string {
  if (!value) return "—";
  const day = value.match(/^\d{4}-\d{2}-\d{2}/)?.[0];
  return day ? formatDay(day) : value;
}

function shortAddress(url: string): string {
  const { pathname, search } = new URL(url);
  return `${pathname}${search}` || "/";
}

/** Pick which discovered pages to index, say how they are published, and queue them. */
export function SelectPagesForm({
  siteUrl,
  pages,
  truncated,
}: {
  siteUrl: string;
  pages: CandidatePage[];
  truncated: boolean;
}) {
  const [state, formAction] = useActionState<UploadFormState, FormData>(startSiteImportAction, { error: null });
  const values = state.values ?? {};
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [filter, setFilter] = useState("");

  const needle = normalize(filter.trim());
  const visible = pages.filter(
    (page) => !needle || normalize(`${page.title ?? ""} ${page.url}`).includes(needle),
  );
  const selectable = visible.filter((page) => !page.existingDocumentId);
  const atLimit = selected.size >= MAX_IMPORT_PAGES;
  const allVisibleSelected = selectable.length > 0 && selectable.every((page) => selected.has(page.url));

  function toggle(url: string) {
    setSelected((current) => {
      const next = new Set(current);
      if (next.has(url)) {
        next.delete(url);
      } else if (next.size < MAX_IMPORT_PAGES) {
        next.add(url);
      }
      return next;
    });
  }

  function toggleAllVisible() {
    setSelected((current) => {
      const next = new Set(current);
      if (allVisibleSelected) {
        selectable.forEach((page) => next.delete(page.url));
      } else {
        for (const page of selectable) {
          if (next.size >= MAX_IMPORT_PAGES) break;
          next.add(page.url);
        }
      }
      return next;
    });
  }

  return (
    <form action={formAction} className="flex flex-col gap-6">
      <input type="hidden" name="siteUrl" value={siteUrl} />
      <input type="hidden" name="origin" value="WEB" />
      <input type="hidden" name="url" value={siteUrl} />

      {state.error && (
        <Alert tone="destructive" live title="No se pudo iniciar la importación">
          {state.error}
        </Alert>
      )}

      <div className="flex flex-col gap-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <Input
            type="search"
            value={filter}
            onChange={(event) => setFilter(event.target.value)}
            placeholder="Filtrar páginas"
            aria-label="Filtrar páginas"
            className="max-w-64"
          />
          <p className="type-body text-foreground-lighter" aria-live="polite">
            {selected.size} de {MAX_IMPORT_PAGES} seleccionadas
          </p>
        </div>
        {truncated && (
          <Alert tone="info" title="Hay más páginas de las que se muestran">
            Se listan las más recientes. Para ver otras, indica la dirección de una sección concreta del sitio.
          </Alert>
        )}

        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-10">
                <Checkbox
                  aria-label="Seleccionar las páginas visibles"
                  checked={allVisibleSelected}
                  disabled={selectable.length === 0}
                  onChange={toggleAllVisible}
                />
              </TableHead>
              <TableHead>Página</TableHead>
              <TableHead>Actualizada</TableHead>
              <TableHead>Estado</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {visible.map((page) => {
              const isSelected = selected.has(page.url);
              const known = page.existingDocumentId !== null;
              return (
                <TableRow key={page.url}>
                  <TableCell>
                    <Checkbox
                      name="page"
                      value={page.url}
                      checked={isSelected}
                      disabled={known || (!isSelected && atLimit)}
                      onChange={() => toggle(page.url)}
                      aria-label={`Importar ${page.title ?? shortAddress(page.url)}`}
                    />
                    {isSelected && page.title && <input type="hidden" name={`title:${page.url}`} value={page.title} />}
                  </TableCell>
                  <TableCell>
                    <div className="font-medium text-foreground">{page.title ?? shortAddress(page.url)}</div>
                    {page.title && <div className="type-body text-foreground-lighter">{shortAddress(page.url)}</div>}
                  </TableCell>
                  <TableCell className="text-foreground-lighter">{formatModified(page.lastModified)}</TableCell>
                  <TableCell>{known && <Badge tone="neutral">Ya añadida</Badge>}</TableCell>
                </TableRow>
              );
            })}
            {visible.length === 0 && (
              <TableEmpty colSpan={4} title="Ninguna página coincide" description="Prueba con otras palabras." />
            )}
          </TableBody>
        </Table>
      </div>

      <div className="flex max-w-page-sm flex-col gap-4">
        <p className="type-body text-foreground-lighter">
          Cada página se añade como un documento propio, con los mismos datos de versión y vigencia.
        </p>
        <Field label="Versión" description="Por ejemplo: 2024 o 1.0.">
          <Input type="text" name="version" defaultValue={values.version} required />
        </Field>
        <Field label="En vigor desde">
          <Input type="date" name="effectiveFrom" defaultValue={values.effectiveFrom} required />
        </Field>
        <Field label="En vigor hasta" optional description="Déjalo vacío si sigue vigente.">
          <Input type="date" name="effectiveUntil" defaultValue={values.effectiveUntil} />
        </Field>
        <Field label="Nota de fuente" optional description="Por ejemplo: web oficial, consultada el 1/10/2026.">
          <Input type="text" name="sourceNote" defaultValue={values.sourceNote} />
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
        <Field label="Estado" description="Un borrador no se usa en las búsquedas.">
          <NativeSelect name="status" defaultValue={values.status ?? "CURRENT"}>
            <option value="CURRENT">Vigente</option>
            <option value="DRAFT">Borrador</option>
          </NativeSelect>
        </Field>
      </div>

      <div className="flex gap-2">
        <SubmitButton disabled={selected.size === 0}>
          {selected.size === 0 ? "Importar páginas" : `Importar ${selected.size} ${selected.size === 1 ? "página" : "páginas"}`}
        </SubmitButton>
        <Button type="button" variant="ghost" onClick={() => setSelected(new Set())} disabled={selected.size === 0}>
          Quitar selección
        </Button>
      </div>
    </form>
  );
}
