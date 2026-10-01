"use client";

import { useState } from "react";
import { Filter, Send, Trash2 } from "lucide-react";
import { Section } from "@/app/(app)/ui-kit/section";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { Input, Textarea } from "@/components/ui/input";
import { Dialog, DialogBody, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { DiscardChangesDialog } from "@/components/ui/discard-changes-dialog";
import { useConfirmOnClose } from "@/components/ui/use-confirm-on-close";
import { Sheet, SheetBody, SheetContent, SheetFooter, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { toast } from "@/components/ui/toast";
import { Table, TableBody, TableCell, TableEmpty, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { DataList } from "@/components/ui/data-list";
import { SearchInput } from "@/components/ui/search-input";
import { FilterBar } from "@/components/ui/filter-bar";
import { SegmentedControl } from "@/components/ui/segmented-control";
import { RelativeTime } from "@/components/ui/relative-time";
import { Badge } from "@/components/ui/badge";
import { Avatar } from "@/components/ui/primitives";

const CONVERSATIONS = [
  { key: "1", href: "#1", name: "Ada Lovelace", preview: "Necesito ayuda con mi caso", minutesAgo: 4 },
  { key: "2", href: "#2", name: "Grace Hopper", preview: "Te envío el borrador mañana", minutesAgo: 90 },
  { key: "3", href: "#3", name: "Katherine Johnson", preview: "Gracias, te escribo los detalles", minutesAgo: 60 * 30 },
];

const MEMBERS = [
  { id: "1", name: "Ada Lovelace", email: "ada@example.com", role: "ADMIN" },
  { id: "2", name: "Grace Hopper", email: "grace@example.com", role: "DELEGATE" },
];

/**
 * Phase-3 interactive demos (docs/ui/ROADMAP.md, UI-3): Dialog, ConfirmDialog,
 * DiscardChangesDialog, Sheet's dirty-form dismissal, Tabs, Popover, Toast,
 * Table, DataList, SearchInput, FilterBar, SegmentedControl, RelativeTime.
 * Client-only because these need open/pending/typed-text state; the rest of
 * `/ui-kit` stays a plain Server Component.
 */
export function Phase3Interactive({ now }: { now: number }) {
  const [dialogOpen, setDialogOpen] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [confirmTextOpen, setConfirmTextOpen] = useState(false);
  const [failNext, setFailNext] = useState(false);
  const [segment, setSegment] = useState("unread");

  return (
    <>
      <Section title="Dialog" description="Tarea corta y centrada. Sheet es para formularios largos o vistas de detalle.">
        <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
          <DialogTrigger asChild>
            <Button variant="outline">Abrir diálogo</Button>
          </DialogTrigger>
          <DialogContent size="sm">
            <DialogHeader>
              <DialogTitle>Vincular a un caso</DialogTitle>
              <DialogDescription>Esta conversación quedará asociada al expediente elegido.</DialogDescription>
            </DialogHeader>
            <DialogBody>
              <Field label="Caso">
                <Input defaultValue="Baja por incapacidad temporal" />
              </Field>
            </DialogBody>
            <DialogFooter>
              <Button onClick={() => setDialogOpen(false)}>Cancelar</Button>
              <Button variant="primary" onClick={() => setDialogOpen(false)}>
                Vincular
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </Section>

      <Section title="ConfirmDialog" description="El único componente de confirmación. Danger, error inline, y confirmText para lo irreversible.">
        <div className="flex flex-wrap items-center gap-2">
          <Button variant="danger" icon={<Trash2 />} onClick={() => setConfirmOpen(true)}>
            Desconectar canal
          </Button>
          <label className="flex items-center gap-2 type-caption text-foreground-lighter">
            <input type="checkbox" checked={failNext} onChange={(event) => setFailNext(event.target.checked)} />
            simular error
          </label>
          <Button variant="danger" onClick={() => setConfirmTextOpen(true)}>
            Eliminar organización
          </Button>
        </div>

        <ConfirmDialog
          open={confirmOpen}
          onOpenChange={setConfirmOpen}
          title="Desconectar canal"
          description="Dejarán de sincronizarse los mensajes de este número."
          confirmLabel="Desconectar"
          confirmLoadingLabel="Desconectando…"
          variant="danger"
          successMessage="Canal desconectado"
          onConfirm={async () => {
            await new Promise((resolve) => setTimeout(resolve, 900));
            if (failNext) {
              throw new Error("El proveedor rechazó la solicitud. Inténtalo de nuevo.");
            }
          }}
        />
        <ConfirmDialog
          open={confirmTextOpen}
          onOpenChange={setConfirmTextOpen}
          title="Eliminar organización"
          description="Se perderán todos los contactos, casos y conversaciones. Esta acción no se puede deshacer."
          confirmLabel="Eliminar organización"
          variant="danger"
          confirmText="gestoria-martin"
          onConfirm={async () => {
            await new Promise((resolve) => setTimeout(resolve, 600));
          }}
          successMessage="Organización eliminada"
        />
      </Section>

      <Section title="Sheet con formulario sucio" description="Cerrar con cambios sin guardar pide confirmación (useConfirmOnClose + DiscardChangesDialog).">
        <DirtySheetDemo />
      </Section>

      <Section title="Tabs" description="Vistas locales; si cambian la URL, usa ContextNav en su lugar.">
        <Tabs defaultValue="details" className="max-w-page-sm">
          <TabsList>
            <TabsTrigger value="details">Detalles</TabsTrigger>
            <TabsTrigger value="activity">Actividad</TabsTrigger>
          </TabsList>
          <TabsContent value="details">
            <p className="type-body text-foreground-lighter">Nombre, teléfono y notas del contacto.</p>
          </TabsContent>
          <TabsContent value="activity">
            <p className="type-body text-foreground-lighter">Contact creado · Case creado · Task completada</p>
          </TabsContent>
        </Tabs>
      </Section>

      <Section title="Popover" description="Filtros compuestos y selectores pequeños.">
        <Popover>
          <PopoverTrigger asChild>
            <Button variant="outline" icon={<Filter />}>
              Filtrar
            </Button>
          </PopoverTrigger>
          <PopoverContent>
            <div className="flex flex-col gap-3">
              <Field label="Canal">
                <Input placeholder="WhatsApp" />
              </Field>
              <Field label="Delegado">
                <Input placeholder="Marta" />
              </Field>
              <Button variant="primary" size="sm" block>
                Aplicar filtros
              </Button>
            </div>
          </PopoverContent>
        </Popover>
      </Section>

      <Section title="Toast" description="Feedback no bloqueante; los errores de formulario van en línea, no aquí.">
        <div className="flex flex-wrap items-center gap-2">
          <Button onClick={() => toast.success("Cambios guardados")}>Éxito</Button>
          <Button onClick={() => toast.error("No se pudo conectar el canal")}>Error</Button>
          <Button onClick={() => toast("Invitación revocada")}>Neutro</Button>
        </div>
      </Section>

      <Section title="Table" description="Presentacional. Fila interactiva con foco visible; vacío como fila de ancho completo.">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Nombre</TableHead>
              <TableHead>Email</TableHead>
              <TableHead>Rol</TableHead>
              <TableHead>
                <span className="sr-only">Acciones</span>
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {MEMBERS.map((member) => (
              <TableRow key={member.id} interactive onActivate={() => toast(`Abriendo a ${member.name}`)}>
                <TableCell className="font-medium text-foreground">{member.name}</TableCell>
                <TableCell className="text-foreground-lighter">{member.email}</TableCell>
                <TableCell>
                  <Badge tone="outline">{member.role}</Badge>
                </TableCell>
                <TableCell>
                  <Button size="sm" variant="ghost" onClick={() => toast(`Revocando a ${member.name}`)}>
                    Revocar
                  </Button>
                </TableCell>
              </TableRow>
            ))}
            <TableEmpty colSpan={4} title="Sin más miembros" description="Invita a alguien para verlo aquí." />
          </TableBody>
        </Table>
      </Section>

      <Section title="DataList" description="Lista densa de filas-enlace con foco continuo (una sola parada de Tab; J/K o flechas se mueven).">
        <DataList
          aria-label="Conversaciones de ejemplo"
          items={CONVERSATIONS}
          renderItem={(conversation) => (
            <div className="flex items-center gap-3 border-b border-border px-3 py-2.5 last:border-0 hover:bg-state-hover">
              <Avatar name={conversation.name} size="sm" />
              <div className="min-w-0 flex-1">
                <p className="truncate type-label text-foreground">{conversation.name}</p>
                <p className="truncate type-caption text-foreground-lighter">{conversation.preview}</p>
              </div>
              <RelativeTime
                date={new Date(now - conversation.minutesAgo * 60_000)}
                className="shrink-0 type-caption text-foreground-lighter"
              />
            </div>
          )}
        />
      </Section>

      <Section title="SearchInput, FilterBar y SegmentedControl" description="Buscar, filtrar y elegir la vista, en una fila.">
        <FilterBar
          search={<SearchInput placeholder="Buscar nombre, teléfono o mensaje" aria-label="Buscar" />}
          filters={
            <SegmentedControl
              aria-label="Vista"
              value={segment}
              onChange={setSegment}
              items={[
                { value: "pending", label: "Pendientes", count: 4 },
                { value: "unread", label: "No leídas", count: 2 },
                { value: "all", label: "Todas" },
              ]}
            />
          }
          actions={
            <Button size="sm" variant="primary" icon={<Send />}>
              Nueva
            </Button>
          }
        />
      </Section>
    </>
  );
}

function DirtySheetDemo() {
  const [open, setOpen] = useState(false);
  const [text, setText] = useState("");
  const isDirty = text.trim().length > 0;

  function reallyClose() {
    setOpen(false);
    setText("");
  }

  const { confirmOnClose, handleOpenChange, modalProps } = useConfirmOnClose({
    checkIsDirty: () => isDirty,
    onClose: reallyClose,
  });

  return (
    <>
      <Sheet open={open} onOpenChange={(next) => (next ? setOpen(true) : handleOpenChange(false))}>
        <SheetTrigger asChild>
          <Button variant="outline">Editar nota</Button>
        </SheetTrigger>
        <SheetContent size="sm">
          <SheetHeader>
            <SheetTitle>Nota del contacto</SheetTitle>
          </SheetHeader>
          <SheetBody>
            <Field label="Nota">
              <Textarea value={text} onChange={(event) => setText(event.target.value)} placeholder="Escribe algo y luego cierra el panel" />
            </Field>
          </SheetBody>
          <SheetFooter>
            <Button onClick={confirmOnClose}>Cancelar</Button>
            <Button variant="primary" onClick={reallyClose}>
              Guardar
            </Button>
          </SheetFooter>
        </SheetContent>
      </Sheet>
      <DiscardChangesDialog {...modalProps} />
    </>
  );
}
