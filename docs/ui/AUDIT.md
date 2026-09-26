# AUDIT.md — Fase 0: auditoría de la UI (2026-09-26)

Foto del punto de partida antes del rediseño. **No se actualiza** conforme
avanzan las fases (es histórica); el estado vivo está en `ROADMAP.md`.

## 1. Arquitectura actual

- Next.js 16 App Router, React 19, Tailwind CSS v4 (`@tailwindcss/postcss`),
  sin `tailwind.config`: el tema se declara con `@theme inline` en
  `src/app/globals.css`.
- Grupos de rutas: `(public)` (landing + legales, con su propio layout
  cuidado), `(app)` (autenticado), y páginas sueltas de auth (`/login`,
  `/forgot-password`, `/reset-password`, `/invite/[token]`).
- **No hay carpeta de componentes compartidos.** Cada página compone su
  marcado con utilidades de Tailwind en línea. Los únicos componentes
  extraídos viven junto a su ruta: `activity-feed.tsx`, `sign-out-button.tsx`,
  `auto-refresh.tsx`, `conversation-thread.tsx`, `delivery-ticks.tsx`,
  `preflight-form.tsx`, `sign-up-form.tsx`, `reset-password-form.tsx`.
- Dependencias de UI: **ninguna** (ni Radix, ni shadcn, ni iconos, ni
  `clsx`/`cva`). `docs/ARCHITECTURE.md` §13 ya prevé shadcn/ui.
- Tests: Vitest en entorno `node` (sin DOM) + Playwright E2E. Los E2E
  seleccionan por **texto visible, rol y placeholder** (~190 selectores) y en
  un caso por clase (`font-semibold` = no leído en `tests/e2e/inbox.spec.ts`).

## 2. Sistema de estilos y tokens

- `globals.css` define una paleta propia **solo usada por el sitio público**:
  `--ink`, `--ink-soft`, `--ink-faint`, `--paper`, `--line`, `--stamp`,
  `--stamp-soft`, evidencia (`--evidence-*`) y `--alert`. Bien razonada
  (PKG-010) y con identidad: se conserva y se convierte en primitivas.
- La app autenticada **no usa esos tokens**: usa la paleta por defecto de
  Tailwind en crudo. Recuento: 27 archivos con `zinc-*`, `amber-*`,
  `red-*`, `emerald-*` (≈230 apariciones; las más comunes `zinc-300`,
  `zinc-500`, `zinc-900`).
- Sin tokens de radio, sombra, altura de control, z-index, duración ni
  tipografía por rol. Todo se decide en cada `className`.
- Existe `prefers-reduced-motion` global (bien) y utilidades de prosa legal.

## 3. Layout y navegación

- `(app)/layout.tsx`: un header con enlaces de texto planos (Inbox,
  Contacts, Cases, Tasks, Canales, Miembros), el nombre de la organización y
  el rol en texto, y botón "Cerrar sesión". Contenido en `max-w-4xl`.
- Sin sidebar, sin estado activo en la navegación, sin breadcrumbs, sin
  navegación contextual, sin *skip link*, sin landmarks `nav` etiquetados.
- `/dashboard` es la pantalla post-login y es un marcador de posición que
  dice "El Inbox real llega en un paquete posterior" (desfasado: el Inbox ya
  existe).
- `metadata.title` genérico en todas las páginas de la app (no hay título
  por página).

## 4. Problemas de UX detectados

Por prioridad (impacto en el uso diario):

1. **Inbox lento de escanear**: una línea por conversación con nombre,
   canal, delegado, preview y fecha completa `toLocaleString` en la misma
   fila; el "no leído" es un punto de 8 px y negrita; no hay búsqueda, ni
   filtro por estado/delegado, ni orden explícito; filtros como enlaces-pill
   sin agrupar.
2. **Abrir una conversación saca de la lista** (navegación completa a
   `/inbox/[id]`); volver pierde scroll y contexto.
3. **Conversación sin cabecera fija ni scroll propio**: la página entera
   hace scroll; el compositor queda debajo de todo el historial.
4. **Formularios de alta siempre visibles** encima de las listas
   (Contacts, Tasks): la acción principal ocupa más que el contenido.
5. **Acciones destructivas sin confirmación**: "Revocar" invitación,
   "Desconectar" canal se ejecutan con un clic.
6. **Sin feedback de envío** en server actions (sin estado *pending*, sin
   toasts), salvo en el hilo de conversación (PKG-013).
7. **Organización invisible**: aparece como texto en el header; miembros y
   canales son páginas sueltas sin relación visible entre sí.
8. **Mezcla de idiomas** en la UI (Contacts / Canales / Miembros).
9. **Fechas** siempre en formato largo; ninguna relativa ("hace 5 min")
   donde importa la recencia.

## 5. Duplicaciones e inconsistencias

- La clase de input `rounded border border-zinc-300 px-3 py-2 text-sm` se
  repite ~30 veces; el botón primario `rounded bg-zinc-900 px-3 py-1.5
  text-sm font-medium text-white` ~15; los avisos ámbar (`border-amber-200
  bg-amber-50 …`) 4 veces con variaciones.
- Tablas hechas a mano con el mismo `thead` en Contacts y Members.
- Tres formas distintas de "vacío" (`<li>` centrado, `<p>` gris, `<td
  colSpan>`).
- Dos formas de mostrar error (`role="alert"` en Canales; `<p
  className="text-red-600">` en login, sin rol).
- Tonos de estado de canal (`TONE_CLASSES` en `channels/page.tsx`) son un
  mini-sistema local que debería vivir en tokens (`status-*`).

## 6. Reutilizable tal cual

- **Lógica** de `conversation-thread.tsx` (envío optimista, sondeo,
  reintento, "escribiendo…"): se conserva; solo cambia la presentación.
- `delivery-ticks.tsx` (semántica de ✓/✓✓) — se re-estiliza con tokens.
- `describeAccountStatus()` en `modules/messaging/domain.ts` ya produce un
  `tone` semántico: encaja directamente con los tokens de estado.
- Toda la capa de servicios/acciones: el rediseño es de presentación, **no
  toca `src/modules/**` salvo para exponer datos que la UI necesite** (p. ej.
  búsqueda en Inbox).
- El sitio público `(public)` y su tipografía: ya tiene identidad; solo se
  re-apunta a las primitivas nuevas sin cambio visual.

## 7. Dependencias que el rediseño necesita

| Dependencia | Para qué | Fase |
|---|---|---|
| `class-variance-authority`, `clsx`, `tailwind-merge` | Variantes tipadas y fusión de clases (patrón shadcn/Supabase) | 1 |
| `lucide-react` | Iconos (misma librería que Supabase) | 1 |
| `radix-ui` | Primitivas accesibles: Dialog, Sheet, DropdownMenu, Tooltip, Tabs, Popover | 3 |
| `sonner` | Toasts | 3 |
| `cmdk` | Paleta de comandos (⌘K) — opcional | 3 |

Todas son dependencias de cliente sin infraestructura (compatibles con
`CLAUDE.md` §8).
