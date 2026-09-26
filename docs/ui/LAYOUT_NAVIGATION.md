# LAYOUT_NAVIGATION.md — Shell, navegación y anatomía de página

## 1. Estructura general

```text
┌──────────────────────────────────────────────────────────────────┐
│ HEADER  [≡] Kindly / Gestoría Martín ▾ / Inbox        [⌘K] [👤▾] │  h-header, sticky
├──────────────┬───────────────────────────────────────────────────┤
│ SIDEBAR      │ <main id="main">                                  │
│ (global)     │ ┌─────────────┬─────────────────────────────────┐ │
│  Inbox   3   │ │ CONTEXT NAV │ PAGE HEADER  título · [acciones]│ │
│  Contactos   │ │ (del módulo)│ ─────────────────────────────── │ │
│  Casos       │ │  • Vista A  │ CONTENIDO (PageSection…)        │ │
│  Tareas      │ │  • Vista B  │                                 │ │
│  ──────      │ │             │                                 │ │
│  Organización│ └─────────────┴─────────────────────────────────┘ │
│              │                                                   │
│ [«] contraer │                                                   │
└──────────────┴───────────────────────────────────────────────────┘
```

La cadena de contexto que la UI mantiene siempre visible:

| Nivel | Dónde se ve |
|---|---|
| 1. Organización | Header (miga con menú) |
| 2. Módulo | Header (miga) + ítem activo en la sidebar |
| 3. Página | Header (miga, si es detalle) + ítem activo en `ContextNav` |
| 4. Contexto de la página | `PageHeader` (título, descripción, estado) |
| 5. Contenido | `PageSection`s |
| 6. Acciones | `PageHeader` aside, fila de filtros, `CardFooter`, menú de fila |

Implementación prevista (Fase 2): `src/app/(app)/layout.tsx` monta
`AppShell` (`src/components/shell/`). El layout sigue siendo servidor
(resuelve el miembro y la organización); solo la sidebar (contraer) y los
menús son cliente.

## 2. Header superior

- Izquierda: botón de menú (`< md`), logotipo → `/inbox`, **migas**:
  `Organización ▾ / Módulo / Entidad`. La miga de organización abre un
  menú: "Ajustes de la organización", "Miembros", "Canales". Sin
  conmutador de organizaciones (una persona pertenece a una sola:
  `docs/DECISIONS.md`, PKG-006); si eso cambia, el menú es el lugar.
- Derecha: disparador de búsqueda/comandos (⌘K, Fase 3; hasta entonces no
  se muestra), menú de usuario (avatar): nombre, email, rol, "Mis canales",
  "Cerrar sesión".
- Las migas sustituyen a un breadcrumb dentro de la página: **un solo
  sitio** para la ruta (evita duplicar la información de Supabase, que
  tiene ambos por su navegación de proyecto/rama).
- `< md`: se muestra solo el título del nivel actual y, en detalles, un
  botón "Volver" al nivel anterior.

## 3. Sidebar global

- Ítems (en este orden): **Inbox** (con `CountBadge` de no leídas),
  **Contactos**, **Casos**, **Tareas**; separador; **Organización**.
  Futuros (Knowledge, Copiloto) aparecen solo cuando existan.
- Estado activo: fondo `state-selected`, texto `foreground`, barra de 2px
  `primary` a la izquierda, `aria-current="page"`. Inactivo:
  `foreground-light`, hover `state-hover`. El activo se calcula por prefijo
  de ruta (`/contacts/123` activa Contactos).
- Contraíble a iconos (`w-sidebar` ↔ `w-sidebar-collapsed`): botón al pie
  ("Contraer menú" / "Expandir menú", `aria-expanded`). Contraída, cada
  ítem muestra icono + `Tooltip` con el nombre y conserva el `aria-label`.
  Preferencia persistida en **cookie** (`kindly_sidebar`) para que el
  servidor pinte el ancho correcto sin parpadeo.
- `< lg`: contraída por defecto. `< md`: oculta; el botón del header la
  abre como `Sheet` lateral izquierdo (`slide-in-left`) con los mismos
  ítems; al navegar se cierra.
- `nav aria-label="Principal"`.

## 4. Navegación contextual (`ContextNav`)

Cada módulo con más de una vista o subsección tiene su menú contextual:

| Módulo | ContextNav |
|---|---|
| Inbox | Vistas: Pendientes, No leídas, Sin identificar, Todas (con contadores) — ver `INBOX.md` |
| Contactos | (ninguno hasta que haya segmentos) |
| Casos | Por estado (Abiertos, En curso, Cerrados) cuando el lifecycle lo justifique (Fase 6 del producto) |
| Tareas | Pendientes, Completadas, Asignadas a mí |
| Organización | General, Miembros, Canales, (futuro: Roles y permisos, Actividad) |

- `lg+`: columna vertical `w-context-nav` a la izquierda del contenido,
  `nav aria-label="<Módulo>"`, con título de sección (`type-overline`).
- `< lg`: fila horizontal con scroll bajo el `PageHeader`.
- Cada ítem es un **enlace** (cambia la URL o los `searchParams`), con
  `aria-current="page"`. Nunca estado local: la vista se comparte por URL.

## 5. Anatomía de página

`PageContainer` → `PageHeader` → (`ContextNav` horizontal en móvil) →
`PageSection`s. Reglas (adaptadas de Supabase `ui-patterns/layout`):

1. **Anchura por contenido, no por tipo de página**: `sm` ajustes y
   formularios; `md` listas y detalles; `full` Inbox y vistas densas.
2. **Acciones donde ya miras**: con fila de filtros, a su derecha; sin
   filtros, en el `aside` del `PageHeader`; de una sección, en su aside.
3. **Crear** abre un `Sheet` (o `Dialog` si son ≤ 3 campos); los
   formularios de alta **no** están permanentemente encima de las listas.
4. Título de página = nombre de la cosa ("Contactos", "Ada Lovelace"), no
   instrucción. Descripción declarativa, sin punto final.
5. Estados de la página completos: `loading.tsx` con skeleton con la forma
   del contenido, `error.tsx` con `Alert` y reintento, `not-found.tsx`
   con enlace de vuelta, `EmptyState` para vacío.

## 6. Título del navegador

Del más específico al más general, con un único helper
(`src/lib/page-title.ts`, Fase 4): `Ada Lovelace · Contactos · Gestoría
Martín · Kindly`. Hoy `metadata.title` usa `template: "%s"`.

## 7. Rutas

Las URLs actuales se mantienen salvo la Organización (`ORGANIZATION.md`):
`/members` → `/organization/members`, `/channels` →
`/organization/channels` (con redirecciones permanentes en
`next.config.ts` y E2E actualizados en el mismo commit). `/dashboard`
deja de ser destino: tras login se va a `/inbox` (el producto dice que la
pantalla inicial es el Inbox, `docs/ARCHITECTURE.md` §11) y `/dashboard`
redirige.
