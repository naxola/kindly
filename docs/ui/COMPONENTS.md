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
| `Dialog` | ⚪ | Centrado, `max-w-dialog-*`, `surface-200`, `shadow-lg`, `radius-overlay`, `z-modal`. Header (título + descripción obligatoria para `aria-describedby`), cuerpo, footer con acciones (primaria a la derecha). Focus trap, `Esc`, clic en velo, foco devuelto al disparador |
| `ConfirmDialog` | ⚪ | **El único componente de confirmación.** Props: `title`, `description` (consecuencia), `confirmLabel` (repite la acción), `confirmLoadingLabel`, `cancelLabel` ("Cancelar"), `variant` (`default` \| `danger`), `confirmText` (opcional: exige escribir un texto exacto para irreversibles — TextConfirmDialog de Supabase), `children` (contexto extra), `onConfirm` (async; mientras corre: botón en loading, cierre bloqueado), `error` (se muestra dentro, sobre las acciones, sin cerrar). Acepta `action` (server action + campos ocultos) para usarse en páginas servidor. Tras éxito: cierra y lanza toast de éxito opcional (`successMessage`) |
| `DiscardChangesDialog` + `useConfirmOnClose` | ⚪ | Cerrar un Dialog/Sheet con formulario sucio pide "Descartar cambios" / "Seguir editando" |
| `Sheet` | ⚪ | Panel lateral, derecha por defecto. `size`: `sm/md/lg/full` → `max-w-sheet-*`; siempre `w-full` por debajo de `md` (pantalla completa en móvil). Slots: `SheetHeader` (sticky), `SheetBody` (scroll propio), `SheetFooter` (sticky). `modal` por defecto (velo, focus trap, `Esc`). Animación `slide-in-right`/`slide-out-right` |
| `DropdownMenu` | ⚪ | Menú de acciones (fila, usuario, organización). Ítem `destructive` abre `ConfirmDialog`, nunca ejecuta directamente |
| `Tooltip` | ⚪ | Solo para explicar el porqué (una frase). Nunca contenido imprescindible. Se integra con `Button.disabledReason` |
| `Tabs` | ⚪ | Pestañas en página; si cambian la URL, usar `ContextNav` horizontal (enlaces), no Tabs |
| `Popover` | ⚪ | Filtros compuestos, selectores |
| `Toaster` (`sonner`) + `toast()` | ⚪ | Feedback no bloqueante o cuando la superficie de origen ya no está visible. Errores de formulario **no** van a toast. `aria-live=polite`; errores `assertive` |
| `Table` (+ Header/Body/Row/Head/Cell/Empty) | ⚪ | Presentacional. Fila interactiva con `focus-inset`. Columna de acciones con cabecera `sr-only` |
| `DataList` | ⚪ | Lista densa de filas-enlace con navegación por teclado (roving focus, `J/K`), usada por Inbox, Contactos, Tareas |
| `SearchInput` | ⚪ | Input con icono, `type="search"`, atajo `/`, limpia con `Esc` |
| `FilterBar` | ⚪ | Fila de búsqueda + filtros (segmented / select) + acciones a la derecha (patrón "acciones donde ya miras") |
| `SegmentedControl` | ⚪ | Vistas mutuamente excluyentes (Todas / No leídas / Pendientes); radiogroup con flechas |
| `CommandMenu` (`cmdk`) | ⚪ | ⌘K: navegar a módulo, buscar contacto/conversación, acciones globales. Opcional dentro de Fase 3 |
| `RelativeTime` | ⚪ | "hace 5 min" con `<time dateTime>` y título con la fecha completa |

## 3. Patrones de página (Fases 2 y 4)

| Componente | Estado | Especificación |
|---|---|---|
| `AppShell` | ⚪ | Header + Sidebar + `<main id="main">`; `SkipToContent` primero |
| `AppHeader` | ⚪ | Ver `LAYOUT_NAVIGATION.md` §2 |
| `AppSidebar` | ⚪ | Ver `LAYOUT_NAVIGATION.md` §3 |
| `ContextNav` | ⚪ | Navegación contextual del módulo: vertical (`w-context-nav`) en `lg+`, horizontal con scroll en móvil. Enlaces con `aria-current="page"` |
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
