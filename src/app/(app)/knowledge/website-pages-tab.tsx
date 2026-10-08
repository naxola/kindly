"use client";

import { useState, useTransition, type FormEvent } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  addWebsitePageAction,
  queueWebsitePagesAction,
  retryFailedWebsitePagesAction,
} from "@/modules/knowledge/actions";
import { MAX_IMPORT_PAGES, paginate, summarizeWebsite } from "@/modules/knowledge/source-status";
import { formatDay, WEBSITE_PAGE_STATUS_LABELS, WEBSITE_PAGE_STATUS_TONES } from "@/app/(app)/knowledge/labels";
import type { WebsitePageView } from "@/app/(app)/knowledge/website-sheet";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox, Input, NativeSelect } from "@/components/ui/input";
import { Spinner } from "@/components/ui/spinner";
import { Table, TableBody, TableCell, TableEmpty, TableHead, TableHeader, TableRow } from "@/components/ui/table";

const PAGE_SIZES = [10, 25, 50] as const;

const normalize = (value: string) => value.normalize("NFD").replace(/\p{Diacritic}/gu, "").toLowerCase();
const isSelectable = (page: WebsitePageView) => page.status === "DISCOVERED" || page.status === "FAILED";

function shortAddress(url: string): string {
  const { pathname, search } = new URL(url);
  return `${pathname}${search}` || "/";
}

function formatModified(value: string | null): string {
  if (!value) return "—";
  const date = value.match(/^\d{4}-\d{2}-\d{2}/)?.[0];
  return date ? formatDay(date) : value;
}

/** The site's pages: search by address, ten at a time (or more), pick which to index. */
export function WebsitePagesTab({ websiteId, pages }: { websiteId: string; pages: WebsitePageView[] }) {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [pageSize, setPageSize] = useState<number>(10);
  const [pageIndex, setPageIndex] = useState(0);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [newAddress, setNewAddress] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const summary = summarizeWebsite(pages);
  const needle = normalize(query.trim());
  const filtered = pages.filter((page) => !needle || normalize(`${page.title ?? ""} ${page.url}`).includes(needle));
  const view = paginate(filtered, pageIndex, pageSize);
  const selectableInView = view.rows.filter(isSelectable);
  const allInViewSelected = selectableInView.length > 0 && selectableInView.every((page) => selected.has(page.url));
  const atLimit = selected.size >= MAX_IMPORT_PAGES;

  function toggle(url: string) {
    setSelected((current) => {
      const next = new Set(current);
      if (next.has(url)) next.delete(url);
      else if (next.size < MAX_IMPORT_PAGES) next.add(url);
      return next;
    });
  }

  function toggleAllInView() {
    setSelected((current) => {
      const next = new Set(current);
      if (allInViewSelected) {
        selectableInView.forEach((page) => next.delete(page.url));
      } else {
        for (const page of selectableInView) {
          if (next.size >= MAX_IMPORT_PAGES) break;
          next.add(page.url);
        }
      }
      return next;
    });
  }

  function run(work: () => Promise<{ error: string | null }>, onDone?: () => void) {
    setError(null);
    startTransition(async () => {
      const result = await work();
      if (result.error !== null) {
        setError(result.error);
        return;
      }
      onDone?.();
      router.refresh();
    });
  }

  function addPage(event: FormEvent) {
    event.preventDefault();
    run(() => addWebsitePageAction(websiteId, newAddress), () => setNewAddress(""));
  }

  return (
    <div className="flex flex-col gap-4">
      {error && (
        <Alert tone="destructive" live title="No se pudo completar la acción">
          {error}
        </Alert>
      )}
      {summary.waiting > 0 && (
        <p className="type-body flex items-center gap-2 text-foreground-lighter" role="status">
          <Spinner />
          Indexando… {summary.waiting} {summary.waiting === 1 ? "página pendiente" : "páginas pendientes"}. Puedes cerrar el
          panel: continúa mientras la pantalla esté abierta y se retoma al volver.
        </p>
      )}

      <div className="flex flex-wrap items-center justify-between gap-2">
        <Input
          type="search"
          value={query}
          onChange={(event) => {
            setQuery(event.target.value);
            setPageIndex(0);
          }}
          placeholder="Buscar una dirección"
          aria-label="Buscar una página"
          className="max-w-64"
        />
        <p className="type-body text-foreground-lighter" aria-live="polite">
          {selected.size} de {MAX_IMPORT_PAGES} seleccionadas
        </p>
      </div>

      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className="w-10">
              <Checkbox
                aria-label="Seleccionar las páginas de esta tabla"
                checked={allInViewSelected}
                disabled={selectableInView.length === 0}
                onChange={toggleAllInView}
              />
            </TableHead>
            <TableHead>Página</TableHead>
            <TableHead>Actualizada</TableHead>
            <TableHead>Estado</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {view.rows.map((page) => {
            const isSelected = selected.has(page.url);
            return (
              <TableRow key={page.id}>
                <TableCell>
                  <Checkbox
                    checked={isSelected}
                    disabled={!isSelectable(page) || (!isSelected && atLimit)}
                    onChange={() => toggle(page.url)}
                    aria-label={`Indexar ${page.title ?? shortAddress(page.url)}`}
                  />
                </TableCell>
                <TableCell>
                  <div className="font-medium text-foreground">
                    {page.documentId ? (
                      <Link href={`/knowledge/${page.documentId}`} className="focus-ring rounded-sm">
                        {page.title ?? shortAddress(page.url)}
                      </Link>
                    ) : (
                      (page.title ?? shortAddress(page.url))
                    )}
                  </div>
                  {page.title && <div className="type-body text-foreground-lighter">{shortAddress(page.url)}</div>}
                  {page.status === "FAILED" && page.error && (
                    <div className="type-body text-destructive">{page.error}</div>
                  )}
                </TableCell>
                <TableCell className="text-foreground-lighter">{formatModified(page.lastModified)}</TableCell>
                <TableCell>
                  <Badge tone={WEBSITE_PAGE_STATUS_TONES[page.status]}>{WEBSITE_PAGE_STATUS_LABELS[page.status]}</Badge>
                </TableCell>
              </TableRow>
            );
          })}
          {view.rows.length === 0 && (
            <TableEmpty
              colSpan={4}
              title={pages.length === 0 ? "Todavía no hay páginas" : "Ninguna página coincide"}
              description={pages.length === 0 ? "Añade una por su dirección." : "Prueba con otras palabras."}
            />
          )}
        </TableBody>
      </Table>

      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="type-body text-foreground-lighter" aria-live="polite">
          {view.from}–{view.to} de {filtered.length}
        </p>
        <div className="flex items-center gap-2">
          <NativeSelect
            aria-label="Páginas por tabla"
            value={String(pageSize)}
            className="w-auto"
            onChange={(event) => {
              setPageSize(Number(event.target.value));
              setPageIndex(0);
            }}
          >
            {PAGE_SIZES.map((size) => (
              <option key={size} value={size}>
                {size} por página
              </option>
            ))}
          </NativeSelect>
          <Button variant="outline" size="sm" disabled={view.page === 0} onClick={() => setPageIndex(view.page - 1)}>
            Anterior
          </Button>
          <Button
            variant="outline"
            size="sm"
            disabled={view.page >= view.pageCount - 1}
            onClick={() => setPageIndex(view.page + 1)}
          >
            Siguiente
          </Button>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <Button
          variant="primary"
          disabled={selected.size === 0}
          loading={pending}
          loadingText="Preparando…"
          onClick={() => run(() => queueWebsitePagesAction(websiteId, [...selected]), () => setSelected(new Set()))}
        >
          {selected.size === 0
            ? "Indexar páginas"
            : `Indexar ${selected.size} ${selected.size === 1 ? "página" : "páginas"}`}
        </Button>
        {selected.size > 0 && (
          <Button variant="ghost" onClick={() => setSelected(new Set())} disabled={pending}>
            Quitar selección
          </Button>
        )}
        {summary.failed > 0 && summary.waiting === 0 && (
          <Button variant="outline" disabled={pending} onClick={() => run(() => retryFailedWebsitePagesAction(websiteId))}>
            Reintentar {summary.failed} {summary.failed === 1 ? "página con error" : "páginas con error"}
          </Button>
        )}
      </div>

      <form onSubmit={addPage} className="flex max-w-page-sm items-center gap-2 border-t border-border pt-4">
        <Input
          type="url"
          value={newAddress}
          onChange={(event) => setNewAddress(event.target.value)}
          placeholder="Añadir una página por su dirección"
          aria-label="Dirección de la página a añadir"
          required
        />
        <Button type="submit" variant="outline" disabled={pending}>
          Añadir
        </Button>
      </form>
    </div>
  );
}
