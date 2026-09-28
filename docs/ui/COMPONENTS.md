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
| `Button` | `ui/button.tsx` | ✅ | Variantes `primary` (una por vista), `default`, `outline`, `ghost`, `link`, `danger` (solo dentro de una confirmación). Tamaños `sm/md/lg/icon-sm/icon-md`. `loading` + `loadingText`, `icon`, `disabledReason` (deshabilitado pero enfocable, motivo anunciado) |
| `buttonVariants` | `ui/button-variants.ts` | ✅ | Para estilizar un `<Link>` como botón (`className={buttonVariants({variant})}`), **desde un Server Component**: vive en su propio módulo sin `"use client"` a propósito (UI-4) — importarlo desde `ui/button.tsx` en vez de aquí lo convierte en client-only y rompe el patrón, con un error de Next solo visible en tiempo de ejecución, no en el tipado |
| `SubmitButton` | `ui/submit-button.tsx` | ✅ | Para `<form action={serverAction}>`: loading automático con `useFormStatus` |
| `Spinner` | `ui/spinner.tsx` | ✅ | Decorativo salvo que reciba `label` |
| `Input`, `Textarea`, `NativeSelect`, `Checkbox`, `controlVariants` | `ui/input.tsx` | ✅ | Misma altura que `Button` del mismo `size`. `NativeSelect` es el select por defecto (sin JS, picker nativo en móvil). Su `className` controla el `<span>` contenedor (p.ej. ancho: `w-auto` en vez del `w-full` por defecto de un campo de formulario) — el `<select>` interno siempre es `w-full` de ese contenedor, no recibe `className` directamente (UI-5: el contenedor lo ignoraba, partiendo el `FilterBar` de Inbox en columna) |
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
| `Sheet` | ✅ | `ui/sheet.tsx`. Lados `left`/`right`, tamaños `sm/md/lg/full`, `SheetHeader`/`SheetTitle`/`SheetDescription`/`SheetBody`/`SheetFooter`, cierre integrado, patrón de formulario sucio (con `useConfirmOnClose`, ver demo en `/ui-kit`). Modal (velo, focus trap, `Esc`) — el modo anclado sin velo de la conversación (`xl+`, `CHAT.md` §4) **no** es `modal={false}` en este componente: es un `<aside>` aparte sin ningún Radix (`ConversationSheet`, UI-6), porque `SheetTitle`/`SheetDescription` envuelven `Dialog.Title`/`Description` de Radix y **lanzan** fuera de un `Dialog.Root`. `SheetBody` es `forwardRef` (UI-6: rastrear su scroll para el aviso "mensajes nuevos") — sin comportamiento de Radix propio, por eso es seguro reutilizarlo fuera de un `Sheet` |
| `DropdownMenu` | ✅ | `ui/dropdown-menu.tsx`. Usado hoy por `UserMenu` (menú de cuenta del header). `DropdownMenuItem` acepta `tone="destructive"`; "Cerrar sesión" lo usa porque cerrar sesión no es una acción irreversible sobre datos (no necesita `ConfirmDialog`) — un futuro ítem que sí borre algo debe abrir uno en vez de ejecutar directamente |
| `Tooltip` | ✅ | `ui/tooltip.tsx`. Usado hoy por la sidebar contraída (nombre del ítem). Pendiente: integrarlo con `Button.disabledReason` en un caso real |
| `Tabs` | ✅ | `ui/tabs.tsx`. Pestañas en página; si cambian la URL, usar `ContextNav` horizontal (enlaces), no Tabs |
| `Popover` | ✅ | `ui/popover.tsx`. Filtros compuestos, selectores |
| `Toaster` (`sonner`) + `toast()` | ✅ | `ui/toast.tsx`, montado en `AppShell`. `unstyled: true` + `classNames` propios (los estilos de Sonner son grises fijos, no nuestros tokens). Feedback no bloqueante o cuando la superficie de origen ya no está visible; errores de formulario **no** van a toast. `aria-live` lo gestiona Sonner (`polite`/`assertive` según tipo) |
| `Table` (+ Header/Body/Row/Head/Cell/Empty) | ✅ | `ui/table.tsx`. Presentacional. `TableRow interactive onActivate`: clic en cualquier celda salvo un control anidado (botón/enlace/input), `Enter`/`Espacio` solo cuando el foco está en la propia fila (`focus-inset`). `TableEmpty` reutiliza `EmptyState variant="inline"` en una fila de ancho completo |
| `DataList` | ✅ | `ui/data-list.tsx`. Roving tabindex en **estado de React** (`activeIndex`), no mutado en el DOM — sobrevive a un re-render con un `items` nuevo (ver "Hallazgo real" en `ROADMAP.md`, Fase 3). Tab entra una vez; `J`/`K`/flechas mueven la parada; `Home`/`End` a los extremos. El `<Link>` de cada fila lleva la clase `group` (UI-5, primer consumidor con contenido interno que necesita `group-hover:`/`group-focus:`, como la fila de Inbox). `isSelected?: (item) => boolean` (UI-6) marca una fila como la abierta en otro sitio: `state-selected` + barra `primary` a la izquierda + `aria-current="true"` (la fila de Inbox cuya conversación está abierta en el panel) |
| `SearchInput` | ✅ | `ui/search-input.tsx`. Input con icono, `type="search"`, atajo `/` (ignorado si ya se está escribiendo en un campo), `onClear` en `Esc` (el valor es del que llama, un componente controlado no puede limpiarse él solo) |
| `FilterBar` | ✅ | `ui/filter-bar.tsx`. Layout puro (`search`/`filters`/`actions`), no un motor de filtros — los filtros de Kindly son un puñado de selects/segmentos por página, no consultas compuestas. Primer uso real: Inbox (búsqueda + canal + delegado) |
| `SegmentedControl` | ✅ | `ui/segmented-control.tsx`. `role="radiogroup"`, flechas mueven el foco. Dos modos por ítem: `href` (navega) o sin él (estado de React vía `onChange`). Las vistas de Inbox (UI-5) acabaron reutilizando `ContextNav` en su lugar, no éste — ya traía contador por ítem y el layout vertical en `lg+`/horizontal en móvil que pedía `docs/ui/INBOX.md` §2; `SegmentedControl` sigue disponible para segmentos sin esa forma de navegación lateral |
| `CommandMenu` (`cmdk`) | ⚪ | **Aplazado** (era opcional): ninguna página tiene aún búsqueda global que justifique ⌘K. Se construye cuando la primera lo necesite |
| `RelativeTime` | ✅ | `ui/relative-time.tsx`. "hace 5 min" con `<time dateTime>` y título con la fecha completa. Fecha y hora se formatean por separado y se unen con un separador propio — no con `toLocaleString(..., { dateStyle, timeStyle })`, cuyo conector lo compone ICU y puede diferir entre servidor y navegador (real, no teórico: ver "Hallazgo real" en `ROADMAP.md`, Fase 3) |

## 3. Patrones de página (Fases 2 y 4)

| Componente | Estado | Especificación |
|---|---|---|
| `AppShell` | ✅ | `shell/app-shell.tsx`. Rejilla `h-dvh`/`grid-rows-[auto_1fr]`: header fijo, `<main id="main" tabIndex={-1}>` con scroll propio (no un `sticky`+`calc()`) |
| `AppHeader` | 🟡 | `shell/app-header.tsx`. Logo, `MobileNav`, texto de organización (aún no interactivo: ver nota de UI-2 en `ROADMAP.md`), `UserMenu`. Sin buscador/⌘K (Fase 3) |
| `AppSidebar` | ✅ | `shell/app-sidebar.tsx` (`< md`: `shell/mobile-nav.tsx`). Contraíble, persistido en la cookie `kindly_sidebar` (lectura: `shell/sidebar-cookie.ts`; escritura: `shell/sidebar-actions.ts`). Items en `shell/nav-items.ts`, planos por ahora (ver nota de UI-2 en `ROADMAP.md`) |
| `ProductMenu` | ✅ | `shell/product-menu.tsx`. Menú de segundo nivel a toda altura (`lg+`), con cabecera del módulo, grupos con título y reglas entre grupos, y línea vertical que lo separa del contenido — patrón `ProductMenuBar`/`ProductMenu` de Supabase Studio. Reutiliza `ContextNavLink`/`useCurrentHref` de `context-nav.tsx`. Por debajo de `lg` el consumidor muestra un `ContextNav` horizontal con los mismos ítems. **Sin consumidor** desde el 2026-09-28 (Inbox volvió a una sola lista con filtro desplegable); reservado para Organización (UI-7) |
| `ContextNav` | ✅ | `shell/context-nav.tsx`. Inbox lo usó en UI-5 para sus vistas; desde el 2026-09-28 éstas son un desplegable del `FilterBar` y `ContextNav` no tiene consumidor. **Bug real corregido en UI-5**: el estado activo comparaba `pathname === item.href`, pero `usePathname()` no incluye el query string — ningún ítem con `?view=…` coincidía nunca. Ahora compara contra `pathname + '?' + searchParams` |
| `PageContainer` | ✅ | `patterns/page-container.tsx`. `size`: `sm` (ajustes/formularios), `md` (listas y detalle, por defecto), `lg`, `full` (Inbox). Posee el ancho, el gutter horizontal y el ritmo vertical (`gap-8`) — `AppShell` ya no aplica ninguno de los dos |
| `PageHeader` | ✅ | `patterns/page-header.tsx`. Título (`h1`, `type-page-title`), descripción declarativa sin punto final, icono opcional, `aside` para acciones |
| `PageSection` | ✅ | `patterns/page-section.tsx`. Título de sección + descripción + aside + contenido |
| `AuthShell` | ✅ | `patterns/auth-shell.tsx`. Layout compartido de las pantallas previas a la sesión (login, olvidé/cambiar contraseña, invitación) — fuera de `AppShell`, deliberadamente estrecho y sin cambios visuales respecto a antes de UI-4 |
| `useCloseAfterAction` | ✅ | `patterns/use-close-after-action.ts`. Envuelve una Server Action para que su Sheet/Dialog se cierre solo al resolver — el patrón "crear y cerrar" de cada alta (Contacto, Caso, Tarea, Invitar). Los errores no se capturan aquí: salen igual que ya salían fuera de un Sheet, sin recuperación en línea nueva en este paso |

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

## 5. Conversación (Fase 6)

| Componente | Estado | Especificación |
|---|---|---|
| `ConversationSheet` | ✅ | `inbox/[id]/conversation-sheet.tsx`. Header (avatar+canal, nombre, badges, anterior/siguiente, `⋯`, cerrar), aviso de contacto no identificado, `ConversationThread`. Decide su propia carcasa por `useMediaQuery`: `<aside>` propio (anclado, `xl+`, sin Radix) o `Sheet` modal/pantalla completa por debajo — nunca los dos con clases responsive en el mismo árbol (un Dialog con foco atrapado pero invisible seguiría ocultando el resto de la página a un lector de pantalla) |
| `ConversationThread` | ✅ | `inbox/[id]/conversation-thread.tsx`. Historial con separadores por día, burbujas (`bubble-inbound`/`bubble-outbound`), `DeliveryTicks`, aviso "Mensajes nuevos" si el lector ha subido, compositor autoajustable (hasta 6 líneas) con borrador por conversación en `sessionStorage`. Lógica de PKG-013 (envío optimista, sondeo, reintento, "escribiendo…") intacta, solo re-skinned |
| `useMediaQuery` | ✅ | `src/lib/use-media-query.ts`. Sobre `useSyncExternalStore`, no `useState`+`useEffect` — la nueva regla de ESLint `react-hooks/set-state-in-effect` (ver `ROADMAP.md`, Fase 6) marca como error un `setState` síncrono en un efecto, que es como se escribiría ingenuamente. `false` en el servidor y hasta que la hidratación asiente; el destello de un frame en pantallas anchas es el coste aceptado de que un Dialog real necesite JS para decidir si abre modal |
| Compartir estado entre slots de rutas paralelas | ✅ | `inbox/inbox-order-context.tsx` (orden visible de la lista, para `Alt+↑/↓` y `F6`) y `shell/sidebar-auto-collapse.ts` (contraer la sidebar mientras el panel está anclado). Dos soluciones distintas a el mismo problema — lista y panel, o sidebar y panel, viven en árboles de React que no comparten un Server Component común por el que enhebrar Contexto: la primera usa Contexto de React con una mini-tienda externa (`useSyncExternalStore`, dentro de `inbox/layout.tsx`); la segunda, más alejada del Contexto (la sidebar cuelga de `AppShell`, muy por encima de toda la ruta), un evento de `window` |
