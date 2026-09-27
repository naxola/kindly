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

## Fase 2 — Shell de aplicación · 🟢 Completa (2026-09-26)

- **Objetivo**: header + sidebar global + organización en el modelo de
  navegación (`LAYOUT_NAVIGATION.md`).
- **Alcance**: `src/components/shell/` (`AppShell`, `AppHeader`,
  `AppSidebar` contraíble con cookie, `MobileNav`, `UserMenu`,
  `SkipToContent`, `ContextNav` preparado); `src/app/(app)/layout.tsx`;
  destino post-login `/inbox` y redirección de `/dashboard`; contador de
  no leídas en la sidebar (`countUnreadConversations`, nueva consulta en
  servicio). `radix-ui` instalado; primitivas Tooltip, DropdownMenu y
  Sheet construidas ahora (adelantadas de la Fase 3, como estaba previsto).
- **Componentes**: AppShell, AppHeader, AppSidebar, MobileNav, UserMenu,
  ContextNav (construido, sin consumidores todavía), DropdownMenu,
  Tooltip, Sheet (base).
- **Desviación deliberada del diseño original**: la miga de organización
  del header **no es un menú** todavía — es texto plano
  (`{organización} · {rol}`). El diseño original (`LAYOUT_NAVIGATION.md`
  §2) la quería como desplegable a "Ajustes de la organización / Miembros
  / Canales", pero `/organization` no existe hasta la Fase 7: un menú que
  llevase ahí sería un menú a ninguna parte. Por el mismo motivo, la
  sidebar se mantiene **plana** (Inbox, Contacts, Cases, Tasks, Canales,
  Miembros — mismas etiquetas y URLs que el nav anterior) en vez de
  agrupar Canales/Miembros bajo "Organización"; la agrupación llega en la
  Fase 7 cuando esas rutas se mueven a `/organization/*`. El menú de
  usuario tampoco incluye el atajo "Mis canales" que preveía el diseño
  original, por ser redundante con el ítem de sidebar ya existente.
- **Decisión de layout no anticipada**: el shell usa una rejilla
  `h-dvh`/`grid-rows-[auto_1fr]` (header fijo, `<main>` con scroll propio)
  en vez de un `sticky` con `calc()` — mismo patrón que el propio Studio de
  Supabase. Cambia el modelo de scroll de la app (antes la página entera
  hacía scroll); no afectó a ningún E2E existente.
- **Dependencias**: Fase 1.
- **Criterios de aceptación**: ✅ navegación completa por teclado; ✅
  activo con `aria-current`; ✅ sidebar contraída conserva nombres
  (tooltip + `aria-label`); ✅ sin parpadeo de ancho al recargar (cookie
  `kindly_sidebar`, leída en servidor); ✅ móvil con menú en Sheet,
  cerrado al navegar; ✅ E2E existentes en verde (`tests/e2e/shell.spec.ts`
  nuevo: skip link, `aria-current`, contraer/expandir persistido,
  Sheet móvil); ⚠️ el enlace "Canales" pasó a necesitar `exact: true` en
  8 specs — la nueva página de aterrizaje (`/inbox`) contiene "Todos los
  canales" como texto de filtro, que coincidía como subcadena.
- **No modificado**: contenido de las páginas; `src/modules/**` salvo la
  función de solo lectura `countUnreadConversations`.

## Fase 3 — Componentes avanzados · 🟢 Completa (2026-09-26)

- **Objetivo**: el resto de piezas del sistema (`COMPONENTS.md` §2).
- **Alcance**: Dialog, ConfirmDialog (con `confirmText`), DiscardChangesDialog
  + `useConfirmOnClose`, Sheet completo (patrón de formulario sucio),
  Tabs, Popover, Toaster (`sonner`), Table, DataList (roving focus),
  SearchInput, FilterBar, SegmentedControl, RelativeTime. Todo en
  `/ui-kit` (`phase3-interactive.tsx`, cliente; el resto de la página
  sigue siendo servidor).
- **Aplazado, con motivo:**
  - **`CommandMenu` (`cmdk`)**: era opcional en el alcance original; sin
    página que necesite ⌘K todavía (ninguna tiene aún búsqueda global).
    Se construye cuando la primera lo pida (probablemente Fase 5, Inbox).
  - **`loading.tsx`/`error.tsx` patrón**: depende de `PageContainer` (Fase
    4) para tener una forma de página que envolver; sin páginas migradas
    todavía, un esqueleto por ruta sería prematuro. Pasa a la Fase 4.
- **Entorno de test de componentes (decisión tomada):** Vitest +
  `jsdom` + Testing Library, activado **por archivo** con el docblock
  `// @vitest-environment jsdom` (no una config separada) — el resto de
  la suite sigue en `environment: "node"`. `tests/setup.ts` registra
  `afterEach(cleanup)` a mano (RTL solo se auto-limpia con
  `test.globals: true`, que este proyecto no usa) y carga
  `@testing-library/jest-dom/vitest`. Tests nuevos en `tests/components/`:
  `data-list.test.tsx`, `confirm-dialog.test.tsx`, `sheet.test.tsx`
  (teclado, foco, Esc, backdrop — los tres criterios pedidos).
- **Hallazgo real corregido**: `RelativeTime` calculaba el título completo
  con `toLocaleString(..., { dateStyle, timeStyle })`, cuyo conector
  ("a las" / ",") lo compone ICU y puede diferir entre Node y un
  navegador. Como `DataList.renderItem` es una función (no serializable
  Server→Client, obliga a ejecutarse en cliente), cualquier página real
  que use `RelativeTime` dentro de un `DataList` habría tenido el mismo
  *hydration mismatch* que apareció en `/ui-kit`. Corregido formateando
  fecha y hora por separado y uniéndolas con un separador propio.
- **Dependencias**: Fase 1 (Fase 2 aportó DropdownMenu/Tooltip/Sheet base).
- **Criterios de aceptación**: ✅ focus trap y retorno de foco en
  Dialog/Sheet (verificado en E2E real — Radix; jsdom no reproduce el
  timing del retorno de foco de forma fiable, así que el test de
  componente solo verifica que el foco entra); ✅ ConfirmDialog con
  loading/disabled/error/éxito; ✅ todo en `/ui-kit`; ✅ entorno de test de
  componentes con tests de teclado para ConfirmDialog, DataList y Sheet
  (12 tests nuevos, 221 en total).

## Fase 4 — Arquitectura de páginas · 🟢 Completa (2026-09-27)

- **Objetivo**: todas las páginas de `(app)` sobre el sistema.
- **Alcance**: `PageContainer`/`PageHeader`/`PageSection`
  (`src/components/patterns/`) y `pageTitle()` (`src/lib/page-title.ts`);
  Contactos, Casos, Tareas (lista + detalle), Canales (+ flujo de conexión
  WhatsApp), Miembros, y las cuatro pantallas de auth — todas migradas.
  Formularios de alta a Sheet (Contacto 4 campos, Caso 5, Tarea 5) o
  Dialog (Invitar, 2 campos), según el umbral de `COMPONENTS.md` §4;
  confirmaciones (Desconectar canal, Revocar invitación) a `ConfirmDialog`.
  Textos de Contactos/Casos/Tareas traducidos al español (sidebar
  incluida); Canales/Miembros/auth **no** traducidos — no estaba en el
  alcance de esta fase y son textos ya revisados en `docs/DECISIONS.md`.
- **Hecho en 4 commits de checkpoint** (patrones + CRM; Canales; Miembros;
  auth), cada uno verificado end-to-end (lint + typecheck + unit/
  integration + E2E + captura visual real) antes del siguiente.
- **Bug real encontrado y corregido**: `button.tsx` lleva `"use client"`,
  lo que convertía su `buttonVariants` exportado en client-only también
  (el límite RSC de Next se aplica al archivo entero, no export a export),
  rompiendo el patrón "un `<Link>` con pinta de botón desde un Server
  Component" que el propio comentario del componente prometía. Solución:
  `buttonVariants` vive ahora en `button-variants.ts` (sin directiva),
  importado directamente por los Server Components que lo necesitan;
  `button.tsx` solo lo re-exporta para el código cliente que ya lo usaba.
- **Decisión de alcance en los formularios de auth**: los campos de
  `/login`, `/invite`, `/forgot-password` y `/reset-password` ganaron una
  `<Label>` real (antes no tenían ninguna, solo placeholder — el
  anti-patrón exacto que `Field` existe para evitar) pero **visualmente
  oculta**, manteniendo el placeholder con el texto idéntico de antes. La
  alternativa (una `Field` con label visible) habría sido más "correcta"
  en abstracto, pero prácticamente todos los specs de `tests/e2e/` pasan
  por el registro/login usando `getByPlaceholder("Nombre"|"Email"|
  "Contraseña")` — cambiar esa asociación habría exigido tocar casi toda
  la suite para ninguna ganancia real de accesibilidad adicional sobre la
  opción elegida.
- **Criterios de aceptación**: ✅ cero `zinc-*`/`amber-*`… en
  `src/app/(app)` y en las cuatro rutas de auth (`tests/unit/ui-tokens.test.ts`
  cubre ambos, 97 tests); ✅ cada página con estados vacío (`EmptyState`)
  y de error (banners `Alert`); ✅ E2E actualizados y en verde (27/27) —
  `crm.spec.ts` (Sheets + `getByLabel` en vez de `getByPlaceholder`,
  ahora que hay `<label>` reales), `channels.spec.ts`/
  `whatsapp-onboarding.spec.ts` (sin cambios de texto), `members.spec.ts`
  (Dialog/ConfirmDialog, clics del diálogo acotados con
  `getByRole("dialog")` para no chocar con el disparador).
- **Estados de carga/error por ruta** (`loading.tsx`/`error.tsx` de
  Next.js): sigue aplazado a esta misma fase original, pero no se ha
  hecho — no hay ninguna carga lo bastante lenta hoy para justificarlo
  (todo son consultas puntuales); se retoma si UI-5/Inbox lo necesita.

## Fase 5 — Inbox · 🟢 Completa (2026-09-27)

- **Objetivo**: `INBOX.md` completo.
- **Alcance**: vistas (Pendientes/No leídas/Sin identificar/Todas) con
  contadores, búsqueda y filtros por URL, fila densa, teclado (heredado de
  `DataList`, Fase 3), aviso de nuevas, estados. Servidor: consulta
  eficiente de último mensaje por conversación + búsqueda + contadores (con
  tests de integración y aislamiento por `organization_id`).
- **Servidor reescrito**: `listConversationsWithPreview` pasó de cargar
  todos los mensajes de todas las conversaciones a un único
  `LEFT JOIN LATERAL` (último mensaje por conversación); nuevas
  `listConversationChannels` (para el filtro de canal) y
  `countConversationsByView` (4 conteos en paralelo, uno por vista) en
  `src/modules/conversations/service.ts`. `GET /api/inbox` sirve el sondeo
  del cliente (`Cache-Control: no-store`).
- **Vistas como filtro SQL, no como cliente**: `pending` (`INBOUND` el
  último mensaje), `unread`, `unassigned`, `all` son condiciones de la
  misma consulta (`inboxViewCondition`), no un filtrado en memoria — así
  los contadores y la lista nunca pueden discreparon entre sí.
- **Decisión de diseño — contadores vs. búsqueda**: los contadores del
  ContextNav reflejan canal/delegado pero **no** el texto de búsqueda
  (como las carpetas de Gmail, que no reaccionan a lo que escribes en
  buscar) — evita que los números salten en cada tecla.
- **Sondeo sin saltos bajo el cursor**: `InboxList` compara el orden de
  IDs recibido contra el actual; mismo orden → aplica en el sitio; orden
  distinto → lo retiene tras un aviso "Ver" (`docs/ui/INBOX.md` §6).
  Sustituye a `auto-refresh.tsx` (PKG-013), eliminado.
- **Bugs reales encontrados y corregidos** (no eran de esta fase, pero la
  bloqueaban):
  - `ContextNav` comparaba `pathname === item.href` para el estado activo;
    `usePathname()` no incluye el query string, así que ningún `?view=…`
    coincidía nunca. Corregido comparando contra la URL completa
    (`src/components/shell/context-nav.tsx`).
  - `NativeSelect` (`src/components/ui/input.tsx`) forzaba `w-full` en el
    `<span>` contenedor sin admitir override — el `className="w-auto"` que
    le pasa el FilterBar de Inbox solo llegaba al `<select>` interno, y el
    contenedor seguía ocupando toda la fila, partiendo el FilterBar en
    columna incluso en escritorio. Corregido: el `className` del
    consumidor ahora controla el contenedor (el `<select>` interno es
    siempre `w-full` de su contenedor). Ningún otro consumidor pasaba
    `className`, así que no cambia nada fuera de Inbox.
  - `DeliveryTicks` usaba paleta cruda (`zinc-*`/`sky-*`/`red-*`) en vez de
    tokens — migrado (`text-foreground-muted`/`text-info`/
    `text-destructive`) al reutilizarse en la fila de Inbox.
- **Corrección respecto al diseño original de `INBOX.md`**: la fila no
  leída usa un punto simple, no un `CountBadge` — el dominio no cuenta
  mensajes no leídos, solo un booleano (`lastReadAt` vs. último mensaje).
  El indicador de ventana de servicio se difiere de la fila de lista (se
  mantiene solo en la conversación abierta): añadirlo a cada fila exigiría
  un segundo `LEFT JOIN LATERAL` más una consulta de capacidades del
  adapter por canal, repetida en cada sondeo de 5 s. Ver `INBOX.md` §1/§3
  para el detalle.
- **`tests/unit/ui-tokens.test.ts`**: cubre las páginas de lista de Inbox
  (`page.tsx`, `inbox-list.tsx`, `inbox-row.tsx`, `loading.tsx`,
  `error.tsx`) archivo a archivo, no el directorio completo — `inbox/[id]`
  (la conversación) sigue con la paleta previa al sistema de diseño hasta
  la Fase 6.
- **Criterios de aceptación**: ✅ E2E del camino feliz (filtrar, buscar,
  abrir con teclado) — `tests/e2e/inbox.spec.ts` reescrito para las vistas
  por `?view=` y el `FilterBar` (antes: pills de canal y `?unread=1`),
  27/27 en verde; ✅ prueba de aislamiento multi-tenant de la búsqueda y
  los contadores (`tests/integration/inbox.test.ts`, `describe
  countConversationsByView`); ✅ 259/259 unit+integration; ✅ cero
  `zinc-*`/hex/`z-\d+`/píxel arbitrario en los archivos de lista; ✅
  verificación visual real (registro → conectar canal fake → webhooks →
  vistas, búsqueda, filtros, estado vacío con y sin filtros, fila leída/no
  leída, responsive móvil) contra un servidor de desarrollo en el puerto
  3100.

## Fase 6 — Conversación en Sheet (WhatsApp) · 🟢 Completa (2026-09-27)

- **Objetivo**: `CHAT.md` completo.
- **Alcance**: rutas paralelas/interceptadas, `ConversationSheet`, header,
  modos anclado sin velo (`xl+`) / modal / pantalla completa,
  historial con separadores por día y "mensajes nuevos", compositor
  autoajustable con borrador por conversación, navegación
  anterior/siguiente, todos los estados. Lógica de PKG-013 intacta.
- **Rutas**: `inbox/layout.tsx` (`{children}+{sheet}` en fila), `@sheet/
  default.tsx` + `@sheet/page.tsx` (los dos hacen falta — ver corrección en
  `CHAT.md` §1) + `@sheet/(.)[id]/page.tsx` (navegación suave) +
  `[id]/page.tsx` reescrito (carga directa: compone lista + panel él
  mismo). `inbox-data.ts`/`inbox-href.ts` nuevos, factorizando lo que antes
  vivía solo en `page.tsx`, para que ambas rutas de entrada usen la misma
  consulta y el mismo `buildHref`.
- **`ConversationSheet`** (`inbox/[id]/conversation-sheet.tsx`) decide su
  propia carcasa por `useMediaQuery` (nuevo, `src/lib/use-media-query.ts`,
  sobre `useSyncExternalStore` — ver "Hallazgo real" abajo): `<aside>` sin
  Radix en anclado, `Sheet` modal (con velo) o a pantalla completa por
  debajo de `xl`. El contenido (header, aviso de contacto no identificado,
  historial, compositor) es el mismo en los tres casos.
- **Compartir el orden de la lista entre slots**: `inbox-order-context.tsx`
  — la lista y el panel viven en slots de rutas paralelas distintos y no
  pueden pasarse props directamente. Usado para anterior/siguiente
  (`Alt+↑/↓`) y para `F6`/`Ctrl+F6` (alternar foco lista↔panel, el
  sustituto del focus trap que el modo anclado no tiene a propósito).
- **Bugs reales encontrados y corregidos** (ver detalle en `CHAT.md` y
  `docs/DECISIONS.md`):
  - `buildHref` exportado desde un archivo `"use client"` rompía al
    llamarlo desde `[id]/page.tsx` (Server Component) — la misma trampa de
    límite RSC de `buttonVariants` en UI-4. Solución idéntica: extraerlo a
    un módulo sin directiva (`inbox-href.ts`).
  - `@sheet/default.tsx` no cierra el panel al navegar con un `<Link>`
    normal a `/inbox` — hace falta además un `@sheet/page.tsx` real
    (documentado como caveat en la propia guía de Next). Sin él, el panel
    quedaba "fantasma" abierto.
  - El nombre del Contact en la fila de la lista podía colapsar a 0 px y
    desaparecer en modo anclado a 1280 px (el viewport por defecto de
    Playwright) — detalle completo y la solución (`min-w-0 flex-1` +
    `@container`/`@sm:inline` en vez de `sm:inline`) en `CHAT.md` §5.
  - La sidebar no se contraía automáticamente como pedía `CHAT.md` §4 —
    sin ese ahorro de ~170 px, el bug anterior era aún peor. Implementado
    con un evento de `window` (`sidebar-auto-collapse.ts`), no Contexto:
    la sidebar vive en `AppShell`, por encima de toda la ruta.
  - `SheetTitle`/`SheetDescription` envuelven `Dialog.Title`/`Description`
    de Radix, que **lanzan** fuera de un `Dialog.Root` — inutilizables en
    el `<aside>` anclado (a propósito no es un Dialog). `PanelTitle`/
    `PanelDescription` (locales a `conversation-sheet.tsx`) renderizan
    `h2`/`p` con las mismas clases cuando está anclado.
  - Condición de carrera en el borrador (`sessionStorage`): el efecto que
    lo escribe podía borrar lo que el efecto que lo lee acababa de
    encontrar, si ambos corrían en el mismo montaje antes de que el
    `setTimeout` del segundo aplicara el texto — visible en concreto bajo
    el doble-montaje de Strict Mode en desarrollo. Corregido con un
    `hasReadDraftRef` que retiene el efecto de escritura hasta que el de
    lectura termina.
  - El orden de conversaciones compartido por Contexto usaba al principio
    una `ref` pura — un `useMemo` que la lee nunca se recalculaba (las
    `ref` no disparan render), así que anterior/siguiente quedaba
    congelado en el orden del primer montaje. Corregido con una
    mini-tienda externa (`useSyncExternalStore`).
- **Hallazgo real — reglas nuevas de ESLint** (`eslint-plugin-react-hooks`
  7.x, el set "React Compiler"): `react-hooks/set-state-in-effect` marca
  como error un `setState` síncrono dentro de un efecto — el patrón
  habitual para sincronizar con un sistema externo en el montaje (leer
  `matchMedia`, leer `sessionStorage`). `useMediaQuery` se reescribió sobre
  `useSyncExternalStore` (el patrón que la propia regla prefiere); el
  borrador de conversación no tiene un equivalente igual de limpio
  (`sessionStorage` no dispara eventos en la misma pestaña), así que ahí se
  difirió con un `setTimeout(…, 0)`, igual que el efecto de `isLive` ya
  existente. Quedará más código futuro chocando con este mismo set de
  reglas — no son solo `Date.now()`/`new Date()` como en fases anteriores.
- **Turbopack en desarrollo (no en producción)**: un error transitorio
  "Invalid interception route: .../(.)(.)(.)…" apareció tras añadir rutas
  nuevas con el servidor de `next dev` ya corriendo; se resolvió con un
  reinicio limpio (`rm -rf .next`) y no volvió a aparecer. Nunca se
  reprodujo contra `next build && next start` (lo que usa toda la suite
  E2E, siempre en verde) — anotado por si reaparece en una sesión futura.
- **Criterios de aceptación**: ✅ abrir/cerrar sin perder la lista ni su
  scroll; ✅ `Esc`/Atrás cierran; ✅ foco devuelto a la fila; ✅ carga
  directa de `/inbox/<id>` (nuevo test en `inbox.spec.ts`: abre suave,
  recarga, verifica que list+panel siguen ahí); ✅ móvil a pantalla
  completa; ✅ `tests/e2e/inbox.spec.ts` adaptado, 27/27 E2E en verde; ✅
  268/268 unit+integration; ✅ verificación visual real en los tres modos
  (anclado a 1280 px y 1440 px, modal a 900 px, pantalla completa a 390 px)
  más borrador persistente entre cierre/reapertura.

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
