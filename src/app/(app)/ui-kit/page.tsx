import type { Metadata } from "next";
import { Inbox, Plus, Send, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox, Input, NativeSelect, Textarea } from "@/components/ui/input";
import { Field } from "@/components/ui/field";
import { Badge, CountBadge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Alert } from "@/components/ui/alert";
import { EmptyState } from "@/components/ui/empty-state";
import { Avatar, Kbd, Separator, Skeleton } from "@/components/ui/primitives";
import { Section } from "@/app/(app)/ui-kit/section";
import { Phase3Interactive } from "@/app/(app)/ui-kit/phase3-interactive";

export const metadata: Metadata = { title: "UI kit · Kindly" };

// Module scope, not inside the component: a plain `Date.now()` call in a
// component's render body is impure by React's rules (unstable across
// re-renders/the Compiler). Here it isn't reactive at all — it's read once
// when this Server Component module is instantiated for the request — but
// the lint rule can't tell RSC-once from client-reactive, so it stays out
// of the function entirely rather than earning the project's first
// eslint-disable.
const now = Date.now();

/**
 * Living catalogue of the design system (docs/ui/COMPONENTS.md): every
 * token and component state on one page, for visual QA and as the reference
 * a Figma library mirrors. Not linked from the navigation.
 */

const SURFACES = [
  ["background", "bg-background"],
  ["background-muted", "bg-background-muted"],
  ["surface-100", "bg-surface-100"],
  ["surface-200", "bg-surface-200"],
  ["surface-300", "bg-surface-300"],
  ["state-hover", "bg-state-hover"],
  ["state-selected", "bg-state-selected"],
  ["control-disabled", "bg-control-disabled"],
] as const;

const SOLIDS = [
  ["primary", "bg-primary"],
  ["primary-hover", "bg-primary-hover"],
  ["primary-soft", "bg-primary-soft"],
  ["destructive", "bg-destructive"],
  ["destructive-soft", "bg-destructive-soft"],
  ["warning", "bg-warning"],
  ["warning-soft", "bg-warning-soft"],
  ["success-soft", "bg-success-soft"],
  ["info", "bg-info"],
  ["info-soft", "bg-info-soft"],
  ["bubble-inbound", "bg-bubble-inbound"],
  ["bubble-outbound", "bg-bubble-outbound"],
] as const;

const TEXTS = [
  ["foreground", "text-foreground"],
  ["foreground-light", "text-foreground-light"],
  ["foreground-lighter", "text-foreground-lighter"],
  ["foreground-muted (solo deshabilitado)", "text-foreground-muted"],
  ["primary", "text-primary"],
  ["evidence-sufficient", "text-evidence-sufficient"],
  ["evidence-partial", "text-evidence-partial"],
  ["evidence-insufficient", "text-evidence-insufficient"],
] as const;

const TYPE_ROLES = [
  ["type-page-title", "type-page-title", "Conversaciones pendientes"],
  ["type-section-title", "type-section-title", "Invitaciones pendientes"],
  ["type-body", "type-body", "Mensaje de ejemplo con el cuerpo de texto por defecto de la app."],
  ["type-label", "type-label", "Correo electrónico"],
  ["type-caption", "type-caption", "Hace 5 min · WhatsApp"],
  ["type-overline", "type-overline", "Organización"],
] as const;

function Swatch({ name, className }: { name: string; className: string }) {
  return (
    <div className="flex items-center gap-2">
      <span className={`size-8 shrink-0 rounded-md border border-border ${className}`} />
      <code className="type-caption font-mono text-foreground-light">{name}</code>
    </div>
  );
}

export default function UiKitPage() {
  return (
    <div className="flex flex-col gap-10 pb-16">
      <div>
        <h1 className="type-page-title">UI kit</h1>
        <p className="type-body text-foreground-lighter">
          Tokens y componentes base del sistema de diseño. Fuente de verdad: docs/ui/.
        </p>
      </div>

      <Section title="Superficies" description="De la página hacia arriba; las superficies altas se separan con borde y sombra.">
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {SURFACES.map(([name, className]) => (
            <Swatch key={name} name={name} className={className} />
          ))}
        </div>
      </Section>

      <Section title="Acento y estados">
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {SOLIDS.map(([name, className]) => (
            <Swatch key={name} name={name} className={className} />
          ))}
        </div>
      </Section>

      <Section title="Texto">
        <ul className="flex flex-col gap-1">
          {TEXTS.map(([name, className]) => (
            <li key={name} className={`type-body ${className}`}>
              {name} — El contacto escribió hace 5 minutos
            </li>
          ))}
        </ul>
      </Section>

      <Section title="Tipografía" description="Cada rol corresponde a un estilo de texto de Figma (type/<rol>).">
        <ul className="flex flex-col gap-3">
          {TYPE_ROLES.map(([name, className, sample]) => (
            <li key={name} className="flex flex-col gap-0.5">
              <code className="type-caption font-mono text-foreground-lighter">{name}</code>
              <span className={className}>{sample}</span>
            </li>
          ))}
          <li className="flex flex-col gap-0.5">
            <code className="type-caption font-mono text-foreground-lighter">font-document</code>
            <span className="font-document type-body">
              Según el art. 7 del Real Decreto 1619/2012, la factura debe incluir…
            </span>
          </li>
        </ul>
      </Section>

      <Section title="Botones" description="Una acción primary por vista como máximo. Danger solo dentro de una confirmación.">
        <div className="flex flex-wrap items-center gap-2">
          <Button variant="primary" icon={<Send />}>
            Enviar respuesta
          </Button>
          <Button>Cancelar</Button>
          <Button variant="outline" icon={<Plus />}>
            Nuevo contacto
          </Button>
          <Button variant="ghost">Ver historial</Button>
          <Button variant="link">Editar datos</Button>
          <Button variant="danger" icon={<Trash2 />}>
            Revocar invitación
          </Button>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button size="sm">Pequeño</Button>
          <Button size="md">Mediano</Button>
          <Button size="lg">Grande</Button>
          <Button size="icon-sm" aria-label="Añadir">
            <Plus />
          </Button>
          <Button size="icon-md" variant="ghost" aria-label="Añadir">
            <Plus />
          </Button>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button variant="primary" loading loadingText="Enviando…">
            Enviar
          </Button>
          <Button disabled>Deshabilitado</Button>
          <Button variant="primary" disabled disabledReason="Solo un ADMIN puede invitar miembros.">
            Invitar miembro
          </Button>
        </div>
      </Section>

      <Section title="Formularios" description="Field conecta etiqueta, descripción y error con el control.">
        <div className="grid max-w-page-sm gap-4">
          <Field label="Correo electrónico" description="Le llegará un enlace para unirse.">
            <Input type="email" placeholder="nombre@despacho.es" />
          </Field>
          <Field label="Teléfono" error="Usa el formato internacional: +34600111222.">
            <Input type="tel" defaultValue="600111222" />
          </Field>
          <Field label="Rol">
            <NativeSelect defaultValue="DELEGATE">
              <option value="DELEGATE">Delegado</option>
              <option value="ADMIN">Administrador</option>
            </NativeSelect>
          </Field>
          <Field label="Notas" optional>
            <Textarea placeholder="Contexto para el resto del equipo" />
          </Field>
          <Field label="Nombre de la organización" layout="horizontal" description="Visible para todos los miembros.">
            <Input defaultValue="Gestoría Martín" />
          </Field>
          <Field label="Deshabilitado">
            <Input disabled defaultValue="No editable" />
          </Field>
          <label className="flex items-center gap-2 type-body">
            <Checkbox defaultChecked /> Mostrar solo no leídas
          </label>
          <div className="flex flex-wrap items-center gap-2">
            <Input size="sm" className="w-48" placeholder="Pequeño" aria-label="Pequeño" />
            <Button size="sm">Alineado</Button>
          </div>
        </div>
      </Section>

      <Section title="Badges">
        <div className="flex flex-wrap items-center gap-2">
          <Badge>Neutral</Badge>
          <Badge tone="primary">Vigente</Badge>
          <Badge tone="success" dot>
            Conectado
          </Badge>
          <Badge tone="warning" dot>
            Sin identificar
          </Badge>
          <Badge tone="destructive" dot>
            Con error
          </Badge>
          <Badge tone="info">Coexistence</Badge>
          <Badge tone="outline">DELEGATE</Badge>
          <CountBadge count={3} label="mensajes sin leer" />
          <CountBadge count={120} label="mensajes sin leer" />
        </div>
      </Section>

      <Section title="Avisos en contexto">
        <div className="flex max-w-page-sm flex-col gap-3">
          <Alert tone="warning" title="No puedes responder en texto libre ahora mismo">
            La ventana de 24 horas está cerrada. Solo la reabre un mensaje nuevo del contacto.
          </Alert>
          <Alert
            tone="destructive"
            title="No se pudo conectar el canal"
            actions={<Button size="sm">Reintentar</Button>}
          >
            El token ha caducado. Vuelve a autorizar la cuenta.
          </Alert>
          <Alert tone="info">Kindly todavía no envía emails: comparte tú el enlace de invitación.</Alert>
          <Alert tone="success" title="Canal conectado" />
        </div>
      </Section>

      <Section title="Card">
        <Card className="max-w-page-sm">
          <CardHeader>
            <CardTitle>Invitar a alguien</CardTitle>
            <CardDescription>Un ADMIN gestiona la organización; un DELEGATE atiende sus conversaciones.</CardDescription>
          </CardHeader>
          <CardContent>
            <Field label="Correo electrónico">
              <Input type="email" />
            </Field>
          </CardContent>
          <CardFooter>
            <Button>Cancelar</Button>
            <Button variant="primary">Invitar miembro</Button>
          </CardFooter>
        </Card>
      </Section>

      <Section title="Estados vacíos y de carga">
        <EmptyState
          icon={<Inbox />}
          title="Todavía no hay conversaciones"
          description="Conecta tu WhatsApp o Telegram y los mensajes nuevos aparecerán aquí."
          action={<Button variant="primary">Conectar canal</Button>}
        />
        <Card>
          <EmptyState
            variant="inline"
            title="Ninguna conversación coincide con «García»"
            description="Prueba con otro nombre o quita los filtros."
            action={<Button size="sm">Quitar filtros</Button>}
          />
        </Card>
        <div aria-busy className="flex flex-col gap-3">
          <span className="sr-only">Cargando conversaciones</span>
          {[0, 1, 2].map((row) => (
            <div key={row} className="flex items-center gap-3">
              <Skeleton className="size-8 rounded-full" />
              <div className="flex flex-1 flex-col gap-1.5">
                <Skeleton className="h-3.5 w-1/3" />
                <Skeleton className="h-3 w-2/3" />
              </div>
            </div>
          ))}
        </div>
      </Section>

      <Section title="Avatar, teclas y separador">
        <div className="flex flex-wrap items-center gap-4">
          <Avatar name="Ada Lovelace" size="sm" />
          <Avatar name="Ada Lovelace" />
          <Avatar name="Grace" size="lg" />
          <Separator orientation="vertical" className="h-6" />
          <span className="type-caption text-foreground-lighter">
            <Kbd>⌘</Kbd> <Kbd>K</Kbd> buscar · <Kbd>J</Kbd>/<Kbd>K</Kbd> moverse · <Kbd>Esc</Kbd> cerrar
          </span>
        </div>
      </Section>

      {/* `now` flows down as a prop, computed once above: computing it
          inside Phase3Interactive itself (a Client Component) would read
          the clock again at hydration, a few hundred ms after the
          server's render, and RelativeTime would render two different
          labels — a hydration mismatch. */}
      <Phase3Interactive now={now} />
    </div>
  );
}
