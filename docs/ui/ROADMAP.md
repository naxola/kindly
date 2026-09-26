# ROADMAP.md — Rediseño UI/UX por fases

Cada fase es un paquete de trabajo (`UI-0` … `UI-9` en `project/TASKS.md`).
Se trabaja **una fase por sesión o paquete**, con lint + typecheck + tests en
verde antes de commitear (`CLAUDE.md` §4.5). Al cerrar una fase: actualizar
su **Estado** aquí, `COMPONENTS.md` (✅/⚪), `project/TASKS.md`,
`project/CURRENT_TASK.md` y, si cambió algo de fondo, `docs/DECISIONS.md`.

Leyenda de estado: 🟢 completa · 🔴 en curso · ⚪ no iniciada.

## Qué no debe modificarse en ninguna fase (salvo decisión explícita)

- `src/modules/**`: reglas de dominio, permisos, aislamiento multi-tenant.
  El rediseño es de presentación; si la UI necesita un dato o acción nuevos
  (búsqueda en Inbox, cambiar rol), se añade como función de servicio nueva
  con sus tests, sin cambiar las existentes.
- Las tres reglas de `CLAUDE.md` §2 (AI copiloto, identidad del delegado,
  normativa verificable) y los textos que explican limitaciones reales
  (ventana de 24 h, invitaciones sin email, desconexión desde el móvil).
- El sitio público `(public)` y las páginas legales: sin cambios visuales
  (solo sus tokens pasan a apuntar a primitivas).
- Las rutas `/api/**` (webhooks, hilo).
- Los E2E: un texto, rol o URL que cambia se actualiza en su spec en el
  mismo commit; nunca se dejan specs rotos.

---

## Fase 0 — Auditoría · 🟢 Completa (2026-09-26)

- **Objetivo**: conocer el punto de partida y la referencia.
- **Alcance**: arquitectura, estilos, tokens, layouts, navegación,
  problemas de UX, duplicaciones, dependencias; estudio del repo de
  Supabase.
- **Resultado**: `AUDIT.md`, `SUPABASE_REFERENCE.md`, y toda la
  documentación de esta carpeta.
- **Criterios de aceptación**: ✅ documentos creados; ✅ decisiones
  registradas en `docs/DECISIONS.md` (2026-09-26).

## Fase 1 — Design system: tokens y componentes base · 🟢 Completa (2026-09-26)

- **Objetivo**: una única fuente de valores visuales y las piezas base.
- **Alcance**: `src/styles/tokens.css` (primitivas, semánticos, tokens de
  componente, breakpoints, z-index, movimiento, utilidades `focus-ring`,
  `focus-inset`, `type-*`); `src/lib/cn.ts`; `src/components/ui/`:
  Button, SubmitButton, Spinner, Input, Textarea, NativeSelect, Checkbox,
  Label, Field, Badge, CountBadge, Card, Alert, EmptyState, Skeleton,
  Separator, Kbd, Avatar; página `/ui-kit`.
- **Dependencias añadidas**: `class-variance-authority`, `clsx`,
  `tailwind-merge`, `lucide-react`.
- **Decisiones**: tema claro por defecto, capa semántica lista para
  oscuro; primario = verde sello; `foreground-muted` solo para
  deshabilitado; `border-control` a 3:1; select nativo por defecto; foco
  con `outline`. Detalle en `TOKENS.md` y `docs/DECISIONS.md`.
- **Criterios de aceptación**: ✅ tokens cubren color, tipografía, tamaños,
  espaciado, bordes, radios, sombras, alturas, anchuras, breakpoints,
  estados, z-index y movimiento; ✅ test de contraste de todos los pares;
  ✅ test que impide valores sueltos en `src/components`; ✅ `/ui-kit`
  muestra cada estado; ✅ sitio público sin cambios visuales (salvo
  `ink-faint` por contraste).
- **Qué no se tocó**: páginas existentes de `(app)` (siguen con la paleta
  de Tailwind hasta la Fase 4).
- **Pendiente**: tema oscuro (Fase 8, aprobado); exportador DTCG para
  Figma (Fase 9).

## Fase 2 — Shell de aplicación · ⚪

- **Objetivo**: header + sidebar global + organización en el modelo de
  navegación (`LAYOUT_NAVIGATION.md`).
- **Alcance**: `src/components/shell/` (`AppShell`, `AppHeader` con migas
  y menú de organización/usuario, `AppSidebar` contraíble con cookie,
  `SkipToContent`, menú móvil); `src/app/(app)/layout.tsx`; destino
  post-login `/inbox` y redirección de `/dashboard`; contador de no leídas
  en la sidebar (consulta ligera nueva en servicio). Requiere `radix-ui`
  para DropdownMenu/Tooltip/Sheet del menú móvil → **adelanta de la Fase 3
  esas tres primitivas**.
- **Componentes**: AppShell, AppHeader, AppSidebar, ContextNav,
  DropdownMenu, Tooltip, Sheet (base).
- **Dependencias**: Fase 1.
- **Criterios de aceptación**: navegación completa por teclado; activo
  con `aria-current`; sidebar contraída conserva nombres (tooltip +
  `aria-label`); sin parpadeo de ancho al recargar; móvil con menú en
  Sheet; E2E existentes en verde (el enlace "Inbox" exacto y "Canales"
  siguen existiendo o se actualizan los specs); E2E nuevo del shell
  (contraer/expandir, navegar, skip link).
- **No modificar**: contenido de las páginas (solo el marco).

## Fase 3 — Componentes avanzados · ⚪

- **Objetivo**: el resto de piezas del sistema (`COMPONENTS.md` §2).
- **Alcance**: Dialog, ConfirmDialog (con `confirmText`), DiscardChangesDialog
  + `useConfirmOnClose`, Sheet completo, Tabs, Popover, Toaster (`sonner`),
  Table, DataList (roving focus), SearchInput, FilterBar,
  SegmentedControl, RelativeTime, CommandMenu (opcional, `cmdk`),
  `loading.tsx`/`error.tsx` patrón.
- **Dependencias**: Fase 1 (Fase 2 aporta DropdownMenu/Tooltip/Sheet base).
- **Criterios de aceptación**: focus trap y retorno de foco en Dialog/Sheet;
  ConfirmDialog con loading/disabled/error/éxito; todo en `/ui-kit`;
  entorno de test de componentes (Vitest + jsdom + Testing Library solo
  para `src/components`, decisión a registrar) con tests de teclado para
  ConfirmDialog, DataList y Sheet.

## Fase 4 — Arquitectura de páginas · ⚪

- **Objetivo**: todas las páginas de `(app)` sobre el sistema.
- **Alcance**: PageContainer/PageHeader/PageSection; Contactos, Casos,
  Tareas, detalle de cada uno, Canales, Miembros, auth (`/login`,
  `/forgot-password`, `/reset-password`, `/invite`); formularios de alta
  a Sheet/Dialog; confirmaciones con ConfirmDialog; textos de la UI en
  español (Contactos, Casos, Tareas) con sus E2E; helper de títulos del
  navegador.
- **Criterios de aceptación**: cero `zinc-*`/`amber-*`… en `src/app/(app)`
  y auth (se añaden al test de tokens); cada página con estados vacío,
  carga y error; E2E actualizados y en verde.

## Fase 5 — Inbox · ⚪

- **Objetivo**: `INBOX.md` completo.
- **Alcance**: vistas (Pendientes/No leídas/Sin identificar/Todas) con
  contadores, búsqueda y filtros por URL, fila densa, teclado, aviso de
  nuevas, estados. Servidor: consulta eficiente de último mensaje por
  conversación + búsqueda + contadores (con tests de integración y
  aislamiento por `organization_id`).
- **Criterios de aceptación**: E2E del camino feliz (filtrar, buscar,
  abrir con teclado); prueba de aislamiento multi-tenant de la búsqueda.

## Fase 6 — Conversación en Sheet (WhatsApp) · ⚪

- **Objetivo**: `CHAT.md` completo.
- **Alcance**: rutas paralelas/interceptadas, `ConversationSheet`, header,
  modos anclado sin velo (`xl+`) / modal / pantalla completa,
  historial con separadores por día y "mensajes nuevos", compositor
  autoajustable con borrador por conversación, navegación
  anterior/siguiente, todos los estados. Lógica de PKG-013 intacta.
- **Criterios de aceptación**: abrir/cerrar sin perder la lista ni su
  scroll; `Esc`/Atrás cierran; foco devuelto a la fila; carga directa de
  `/inbox/<id>`; móvil a pantalla completa; E2E de `inbox.spec.ts`
  adaptado y en verde.

## Fase 7 — Organización · ⚪

- **Objetivo**: `ORGANIZATION.md` completo.
- **Alcance**: `/organization` (General), `/organization/members`,
  `/organization/channels` (+ `connect/…`), redirecciones desde `/members`
  y `/channels`, invitar en Dialog con "Copiar enlace", revocar/desconectar
  con ConfirmDialog. **Cambiar rol** (aprobado 2026-09-26): acción de
  dominio nueva con sus reglas y tests (`ORGANIZATION.md` §4).
- **Criterios de aceptación**: E2E de miembros, canales y onboarding
  actualizados; permisos por rol visibles y explicados.

## Fase 8 — Accesibilidad y responsive · ⚪

- **Objetivo**: auditar el sistema completo contra `ACCESSIBILITY.md` y
  `RESPONSIVE.md`.
- **Alcance**: `@axe-core/playwright` en E2E principales; recorrido de
  teclado y lector de pantalla; 320/768/1024/1440 px; **tema oscuro**
  (aprobado 2026-09-26): capa semántica bajo `[data-theme="dark"]`,
  selector Claro / Oscuro / Sistema en el menú de usuario (por defecto
  Sistema), preferencia en cookie para pintarlo en servidor sin parpadeo,
  test de contraste también para el tema oscuro, `/ui-kit` en ambos.
- **Criterios de aceptación**: sin violaciones axe serias/críticas;
  checklist manual documentado aquí.

## Fase 9 — Consolidación · ⚪

- **Objetivo**: eliminar lo obsoleto.
- **Alcance**: borrar componentes locales sustituidos, retirar la paleta
  por defecto de Tailwind (`--color-*: initial` salvo la nuestra) y los
  radios/sombras por defecto, `TOKENISED_DIRECTORIES` = todo `src/app`
  salvo `(public)`, exportador de tokens a DTCG para Figma, revisión de
  `COMPONENTS.md`.
- **Criterios de aceptación**: el test de tokens cubre toda la app
  autenticada; ningún componente duplicado.
