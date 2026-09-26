# COMPONENTS.md — Catálogo de componentes

Ubicación: `src/components/ui/` (primitivas y componentes base),
`src/components/patterns/` (composiciones reutilizables: PageHeader,
ConfirmDialog, DataList…), `src/components/shell/` (header, sidebar). Las
piezas específicas de un módulo viven junto a su ruta y **solo** componen
piezas de estas carpetas.

Convenciones de API (alineadas con shadcn/Supabase para que la gramática
sea familiar):

- Variantes con `cva`; props `variant`, `size`, `tone` con nombres
  estables. Estilos exportados (`buttonVariants`, `controlVariants`,
  `badgeVariants`) para aplicarlos a otro elemento (p. ej. un `Link`).
- `className` siempre se acepta y se fusiona con `cn()` (`src/lib/cn.ts`).
- Estados accesibles por atributos, no por clases: `aria-invalid`,
  `aria-disabled`, `aria-busy`, `data-state`. El estilo cuelga del atributo,
  así estilo y semántica no pueden divergir.
- Iconos: `lucide-react`, siempre acompañando texto (salvo botones de
  icono, que exigen `aria-label`), `aria-hidden`.
- Nada de valores visuales sueltos (`TOKENS.md`).

Estado: ✅ implementado · 🟡 parcial · ⚪ pendiente (fase).

## 1. Base (Fase 1)

| Componente | Archivo | Estado | Notas de uso |
|---|---|---|---|
| `Button`, `buttonVariants` | `ui/button.tsx` | ✅ | Variantes `primary` (una por vista), `default`, `outline`, `ghost`, `link`, `danger` (solo dentro de una confirmación). Tamaños `sm/md/lg/icon-sm/icon-md`. `loading` + `loadingText`, `icon`, `disabledReason` (deshabilitado pero enfocable, motivo anunciado) |
| `SubmitButton` | `ui/submit-button.tsx` | ✅ | Para `<form action={serverAction}>`: loading automático con `useFormStatus` |
| `Spinner` | `ui/spinner.tsx` | ✅ | Decorativo salvo que reciba `label` |
| `Input`, `Textarea`, `NativeSelect`, `Checkbox`, `controlVariants` | `ui/input.tsx` | ✅ | Misma altura que `Button` del mismo `size`. `NativeSelect` es el select por defecto (sin JS, picker nativo en móvil) |
| `Label`, `Field` | `ui/field.tsx` | ✅ | `Field` conecta label/description/error con el control por `id`/`aria-describedby`/`aria-invalid`. `layout="horizontal"` para ajustes. `optional` marca lo opcional (lo requerido es la norma) |
| `Badge`, `CountBadge` | `ui/badge.tsx` | ✅ | `tone`: neutral/primary/success/warning/destructive/info/outline; `dot`. El texto siempre dice el estado. `CountBadge` exige `label` ("mensajes sin leer") |
| `Card` + Header/Title/Description/Content/Footer | `ui/card.tsx` | ✅ | Acciones en `CardFooter`, primaria a la derecha |
| `Alert` | `ui/alert.tsx` | ✅ | Aviso *en contexto* (Admonition de Supabase). `live` solo si aparece por una acción del usuario |
| `EmptyState` | `ui/empty-state.tsx` | ✅ | `presentational` (módulo vacío, con acción) / `inline` (sin resultados, mismo hueco que una fila) |
| `Skeleton`, `Separator`, `Kbd`, `Avatar` | `ui/primitives.tsx` | ✅ | `Avatar` de iniciales, decorativo, con `badge` (icono de canal) |

## 2. Avanzados (Fase 3) — sobre Radix (`radix-ui`)

| Componente | Estado | Especificación |
|---|---|---|
| `Dialog` | ✅ | `ui/dialog.tsx`. Centrado, `max-w-dialog-*`, `surface-200`, `shadow-lg`, `radius-overlay`, `z-modal`. `DialogHeader`/`Title`/`Description`/`Body`/`Footer`. Base de `ConfirmDialog` y `DiscardChangesDialog` |
| `ConfirmDialog` | ✅ | `ui/confirm-dialog.tsx`. **El único componente de confirmación.** Props tal como se diseñaron, salvo `error`/`action`: el error no es una prop controlada — se captura automáticamente si `onConfirm` lanza (`error.message`, o "No se pudo completar la acción." si no es un `Error`), que es como ya se comportan las server actions de este proyecto (lanzan, no devuelven `{ok,error}`). Sin prop `action`: se llama desde `onConfirm`, que puede envolver cualquier server action |
| `DiscardChangesDialog` + `useConfirmOnClose` | ✅ | `ui/discard-changes-dialog.tsx` + `ui/use-confirm-on-close.ts`. Mismo API que documenta Supabase (`confirmOnClose`, `handleOpenChange`, `modalProps`). Demo con `Sheet` en `/ui-kit` |
| `Sheet` | 🟡 | `ui/sheet.tsx`. Lados `left`/`right`, tamaños `sm/md/lg/full`, `SheetHeader`/`SheetTitle`/`SheetDescription`/`SheetBody`/`SheetFooter`, cierre integrado, patrón de formulario sucio (con `useConfirmOnClose`, ver demo en `/ui-kit`). Modal únicamente (velo, focus trap, `Esc`). Falta solo para la Fase 6: `modal={false}` para el modo anclado sin velo que usa la conversación en `xl+` (`CHAT.md` §4) |
| `DropdownMenu` | ✅ | `ui/dropdown-menu.tsx`. Usado hoy por `UserMenu` (menú de cuenta del header). `DropdownMenuItem` acepta `tone="destructive"`; "Cerrar sesión" lo usa porque cerrar sesión no es una acción irreversible sobre datos (no necesita `ConfirmDialog`) — un futuro ítem que sí borre algo debe abrir uno en vez de ejecutar directamente |
| `Tooltip` | ✅ | `ui/tooltip.tsx`. Usado hoy por la sidebar contraída (nombre del ítem). Pendiente: integrarlo con `Button.disabledReason` en un caso real |
| `Tabs` | ✅ | `ui/tabs.tsx`. Pestañas en página; si cambian la URL, usar `ContextNav` horizontal (enlaces), no Tabs |
| `Popover` | ✅ | `ui/popover.tsx`. Filtros compuestos, selectores |
| `Toaster` (`sonner`) + `toast()` | ✅ | `ui/toast.tsx`, montado en `AppShell`. `unstyled: true` + `classNames` propios (los estilos de Sonner son grises fijos, no nuestros tokens). Feedback no bloqueante o cuando la superficie de origen ya no está visible; errores de formulario **no** van a toast. `aria-live` lo gestiona Sonner (`polite`/`assertive` según tipo) |
| `Table` (+ Header/Body/Row/Head/Cell/Empty) | ✅ | `ui/table.tsx`. Presentacional. `TableRow interactive onActivate`: clic en cualquier celda salvo un control anidado (botón/enlace/input), `Enter`/`Espacio` solo cuando el foco está en la propia fila (`focus-inset`). `TableEmpty` reutiliza `EmptyState variant="inline"` en una fila de ancho completo |
| `DataList` | ✅ | `ui/data-list.tsx`. Roving tabindex en **estado de React** (`activeIndex`), no mutado en el DOM — sobrevive a un re-render con un `items` nuevo (ver "Hallazgo real" en `ROADMAP.md`, Fase 3). Tab entra una vez; `J`/`K`/flechas mueven la parada; `Home`/`End` a los extremos |
| `SearchInput` | ✅ | `ui/search-input.tsx`. Input con icono, `type="search"`, atajo `/` (ignorado si ya se está escribiendo en un campo), `onClear` en `Esc` (el valor es del que llama, un componente controlado no puede limpiarse él solo) |
| `FilterBar` | ✅ | `ui/filter-bar.tsx`. Layout puro (`search`/`filters`/`actions`), no un motor de filtros — los filtros de Kindly son un puñado de selects/segmentos por página, no consultas compuestas |
| `SegmentedControl` | ✅ | `ui/segmented-control.tsx`. `role="radiogroup"`, flechas mueven el foco. Dos modos por ítem: `href` (navega — así serán las vistas de Inbox, docs/ui/INBOX.md) o sin él (estado de React vía `onChange`) |
| `CommandMenu` (`cmdk`) | ⚪ | **Aplazado** (era opcional): ninguna página tiene aún búsqueda global que justifique ⌘K. Se construye cuando la primera lo necesite |
| `RelativeTime` | ✅ | `ui/relative-time.tsx`. "hace 5 min" con `<time dateTime>` y título con la fecha completa. Fecha y hora se formatean por separado y se unen con un separador propio — no con `toLocaleString(..., { dateStyle, timeStyle })`, cuyo conector lo compone ICU y puede diferir entre servidor y navegador (real, no teórico: ver "Hallazgo real" en `ROADMAP.md`, Fase 3) |

## 3. Patrones de página (Fases 2 y 4)

| Componente | Estado | Especificación |
|---|---|---|
| `AppShell` | ✅ | `shell/app-shell.tsx`. Rejilla `h-dvh`/`grid-rows-[auto_1fr]`: header fijo, `<main id="main" tabIndex={-1}>` con scroll propio (no un `sticky`+`calc()`) |
| `AppHeader` | 🟡 | `shell/app-header.tsx`. Logo, `MobileNav`, texto de organización (aún no interactivo: ver nota de UI-2 en `ROADMAP.md`), `UserMenu`. Sin buscador/⌘K (Fase 3) |
| `AppSidebar` | ✅ | `shell/app-sidebar.tsx` (`< md`: `shell/mobile-nav.tsx`). Contraíble, persistido en la cookie `kindly_sidebar` (lectura: `shell/sidebar-cookie.ts`; escritura: `shell/sidebar-actions.ts`). Items en `shell/nav-items.ts`, planos por ahora (ver nota de UI-2 en `ROADMAP.md`) |
| `ContextNav` | 🟡 | `shell/context-nav.tsx`. Construido en UI-2; sin páginas que lo usen todavía — primeros consumidores en UI-5 (Inbox) y UI-7 (Organización) |
| `PageContainer` | ⚪ | `size`: `sm` (ajustes/formularios), `md` (listas y detalle), `lg`, `full` (Inbox) |
| `PageHeader` | ⚪ | Título (`h1`, `type-page-title`), descripción declarativa sin punto final, `aside` para acciones |
| `PageSection` | ⚪ | Título de sección + descripción + aside + contenido; separación `gap` por token |

## 4. Reglas de elección

- ¿Confirmar algo? `ConfirmDialog`. No se crean diálogos por caso.
- ¿Formulario de más de 3 campos o vista de detalle sin salir de la lista?
  `Sheet`. ¿Una decisión corta? `Dialog`.
- ¿Explicar una condición? `Alert` en el sitio. ¿Confirmar que algo pasó
  fuera de la vista? `toast`.
- ¿Lista de entidades que se abren? `DataList`. ¿Datos tabulares para
  comparar columnas? `Table`.
- ¿Un select con < 15 opciones sin búsqueda? `NativeSelect`. Con búsqueda
  o contenido rico: `Combobox` (se crea cuando haya el primer caso real).
