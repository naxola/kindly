# CHAT.md — Conversación (WhatsApp / Telegram) en Sheet lateral

## 1. Decisión

Abrir una conversación desde el Inbox (o desde un Contacto) la muestra en
un **Sheet que entra desde la derecha**, dejando la pantalla de origen
debajo. Es el patrón de Supabase para "vistas detalladas sin perder el
contexto" (`ui-patterns/modality`: Sheet para vistas detalladas, derecha
por defecto).

### Rutas (Next.js 16: parallel + intercepting routes)

```text
src/app/(app)/inbox/
  layout.tsx              → renderiza {children} + {sheet} (docs/ui/CHAT.md §1)
  page.tsx                → lista
  [id]/page.tsx           → carga directa / refresco: lista + panel, compuestos aquí mismo
  @sheet/page.tsx         → null (match real de /inbox — ver corrección abajo)
  @sheet/default.tsx      → null (fallback de carga directa/refresco)
  @sheet/(.)[id]/page.tsx → <ConversationSheet id> (navegación suave desde /inbox)
```

- La URL sigue siendo `/inbox/<id>`: enlazable, recargable, con historial
  (Atrás cierra el Sheet).
- Carga directa de `/inbox/<id>`: se pinta la lista con el Sheet ya
  abierto (misma experiencia), no una página distinta. La intercepción no
  aplica a la carga directa, así que `[id]/page.tsx` (el slot `children`)
  compone la lista y `<ConversationSheet>` él mismo — no hay otro slot que
  aporte la lista en ese caso.
- Cerrar = `router.back()` si se llegó por navegación suave; si no,
  `router.push('/inbox' + filtros actuales)`. Esto se resuelve por
  **construcción**, no en tiempo de ejecución: `@sheet/(.)[id]/page.tsx`
  solo se renderiza nunca por navegación suave (una carga directa nunca
  pasa por una ruta interceptada), así que siempre pasa `closeMode="back"`;
  `[id]/page.tsx` (slot `children`, carga directa) siempre pasa
  `closeMode="push"` con el href construido a partir de los filtros
  actuales (`buildHref`).
- **Corrección de implementación**: `@sheet/default.tsx` **no basta** para
  cerrar el panel al navegar a `/inbox` con un `<Link>` normal (p. ej. desde
  el nav global). `default.tsx` solo es el *fallback* de una carga directa;
  en una navegación suave a una URL sin ruta real para ese slot, Next.js
  **deja el slot mostrando lo último que tenía** (documentado en la propia
  guía de Next, sección "Modals": *"client-side navigations to a route that
  no longer matches the slot will remain visible"*). Hace falta un
  `@sheet/page.tsx` real (no interceptado) que devuelva `null`, igual que
  su ejemplo `@auth/page.tsx`. Sin este archivo, cerrar por cualquier vía
  que no sea `router.back()` deja el panel fantasma abierto.
- Documentación de referencia: `node_modules/next/dist/docs/01-app/03-api-reference/03-file-conventions/{parallel-routes,intercepting-routes}.md` (sección "Modals").

## 2. Anatomía

```text
┌ SheetHeader (sticky) ─────────────────────────────────────────┐
│ (AL)ᵂ Ada Lovelace [Sin identificar]      [↑][↓] [⋯] [✕]      │
│      WhatsApp · +34 600 111 222 · Delegada: Marta             │
├ Aviso contextual (si aplica) ─────────────────────────────────┤
│ ⚠ Contacto no identificado — [Marcar como identificado] [Reasignar ▾] │
├ SheetBody: historial (scroll propio) ─────────────────────────┤
│              ─── Hoy ───                                      │
│ ┌──────────────────────┐                                      │
│ │ Necesito ayuda…      │ 10:40                                │
│ └──────────────────────┘                                      │
│                         ┌───────────────────────┐             │
│                  10:42  │ Claro, cuéntame más ✓✓ │            │
│                         └───────────────────────┘             │
├ SheetFooter (sticky): compositor ─────────────────────────────┤
│ Ventana abierta hasta las 10:40 de mañana                     │
│ [ Escribe una respuesta...                            ] [Enviar] │
│ Intro para enviar · Mayús+Intro salto de línea                │
└───────────────────────────────────────────────────────────────┘
```

- **Header**: avatar + canal, nombre (enlace al contacto), badges, línea
  secundaria (canal, delegado para ADMIN — sin teléfono: `ConversationDetails`
  no lo trae hoy, añadirlo no era necesario para esta fase). Acciones:
  anterior / siguiente conversación de la lista actual (`Alt+↑/↓`), menú
  `⋯` (solo "Ver contacto" — "Vincular a caso" y "Marcar como no leída"
  siguen sin existir en UI/dominio, tal como ya preveía este documento),
  cerrar (`✕` en anclado/modal, `←` "Volver a la bandeja" en pantalla
  completa).
- **Avisos contextuales** (`Alert`) entre header y mensajes: contacto no
  identificado (acciones existentes: marcar identificado, reasignar);
  canal con error/desconectado.
- **Historial**: scroll independiente; separadores por día; burbujas
  (`bubble-inbound` izquierda, `bubble-outbound` derecha, `radius-bubble`,
  máx. 75% del ancho); hora en `type-caption`; salientes con
  `DeliveryTicks` (✓ enviado, ✓✓ entregado, ✓✓ `read-receipt` leído) y
  "desde el móvil" para ecos de coexistence; al abrir, scroll al final;
  si el usuario ha subido y llegan mensajes, **no** se le arrastra: aparece
  "Mensajes nuevos ↓".
- **Compositor**: `Textarea` que crece hasta 6 líneas; "Enviar" `primary`
  con `Send`; indicación de ventana de servicio. Ventana cerrada → el
  compositor se sustituye por el `Alert` warning actual (texto de
  PKG-013/PKG-005, no se suaviza).
- **Futuro copiloto** (Fase 8 del producto; diseño detallado y ficha del
  afiliado al lado en `CONVERSATION_WORKSPACE.md`, fase UI-10): panel colapsable entre
  historial y compositor con el borrador en `font-document`, fuentes,
  vigencia y `EvidenceLevel`; "Usar borrador" solo **rellena** el
  compositor. Nunca un botón que envíe la sugerencia (`CLAUDE.md` §2).

## 3. Estados

| Estado | Presentación |
|---|---|
| Cargando la conversación | Header con skeleton + 4 burbujas skeleton; compositor deshabilitado |
| Error al cargar | `Alert` destructivo en el body con "Reintentar"; header mínimo con cerrar |
| No encontrada / sin permiso | `EmptyState` "Esta conversación no existe o no tienes acceso" + "Volver al Inbox" |
| Enviando | Burbuja optimista con reloj, opacidad reducida (lógica PKG-013) |
| Error de envío | Burbuja con "No enviado: motivo" + "Reintentar" (`Button link`), anunciado con `role="alert"` |
| Sin mensajes | `EmptyState inline` "Todavía no hay mensajes" |
| Ventana cerrada | `Alert` en lugar del compositor |
| Borrador sin enviar al cerrar | Se conserva por conversación (`sessionStorage`, clave por id) — no pide confirmación: cerrar no pierde nada |

**Diferido en esta fase** (no implementado, no confundir con "hecho"):

- *Cargando la conversación*: no hay un `loading.tsx` propio del slot
  `@sheet` — la navegación simplemente espera a que el servidor responda
  antes de mostrar el panel (el mismo comportamiento por defecto que UI-4
  aceptó para el resto de páginas sin una carga lo bastante lenta como para
  justificarlo). Se añade si algún canal real resulta notablemente lento.
- *Error al cargar*: sin un `error.tsx` propio de `@sheet`; un fallo aquí
  sube al `error.tsx` de `inbox/` (cubre toda la ruta, no solo el panel).
- *No encontrada / sin permiso*: sigue usando `notFound()` de Next (el
  404 genérico), como ya hacía la página que este componente reemplaza —
  no el `EmptyState` a medida "Esta conversación no existe..." que este
  documento proponía. Correcto (nunca expone una Conversation de otra
  Organization), solo no es la presentación más amable posible todavía.

## 4. Comportamiento

Dos modos según el ancho (decidido por el usuario el 2026-09-26: anclado
y **sin velo** en pantallas anchas):

| | **Anclado** (`xl+`, ≥ 1280 px) | **Modal** (`md`–`lg`) | **Pantalla completa** (`< md`) |
|---|---|---|---|
| Presentación | Panel fijo a la derecha, **sin velo**; la lista se estrecha y sigue a la vista e interactiva | Sheet sobre la lista con velo `bg-overlay` | `w-full`, "← Volver" en vez de `✕` |
| Foco | Sin focus trap. Al abrir, el foco va al compositor (o al título si la ventana está cerrada). `F6` / `Ctrl+F6` alternan entre lista y conversación | Focus trap; mismo foco inicial | Focus trap |
| Clic en la lista | Cambia la conversación del panel (no lo cierra) | Cierra (clic en velo) | — |
| Cierre | `✕`, `Esc` (con el foco dentro del panel), Atrás | `✕`, `Esc`, velo, Atrás | "← Volver", Atrás |
| Semántica | `<aside aria-labelledby>` (región complementaria, no `dialog`) | `role="dialog" aria-modal="true"` | `role="dialog" aria-modal="true"` |

Común a los tres:

- Apertura `slide-in-right` (`--duration-slow`); en anclado, el cambio
  entre conversaciones **no** anima (solo cambia el contenido).
- Al cerrar, el foco vuelve a la fila de la lista que lo abrió.
- Anchura en anclado: `--sheet-w-sm` (384 px) en `xl`, `--sheet-w-md`
  (560 px) en `2xl+`; el modal usa `--sheet-w-md`. La lista ocupa el
  resto. **Abrir el panel nunca toca la sidebar global** (decisión del
  2026-09-28, ver `docs/DECISIONS.md`): igual que el asistente de
  Supabase Studio — un panel hermano del contenido que solo estrecha lo
  que tiene al lado —, el ancho se gana con un panel más estrecho en
  `xl`, no contrayendo la navegación. Supersede la contracción automática
  de UI-6 (`sidebar-auto-collapse.ts`, eliminado).
- `< md`: compositor pegado abajo respetando el teclado virtual (`100dvh`,
  `env(safe-area-inset-bottom)`).
- La lista del Inbox **sigue sondeando**; el hilo sondea cada 3 s
  (PKG-013). Abrir marca como leída (regla actual).
- `aria-labelledby` = nombre del contacto; `aria-describedby` = línea
  secundaria. El historial es `role="log"` con `aria-live="polite"` para
  mensajes entrantes nuevos (no para el historial inicial).
- `Alt+↑/↓` pasa a la conversación anterior/siguiente en los tres modos.

## 5. Por qué anclado sin velo en pantallas anchas

Trabajar varias conversaciones seguidas es el caso principal: con la lista
visible y clicable al lado, pasar de una a otra es un clic, y se ve en todo
momento quién más espera. El precio es renunciar al focus trap en ese
modo; se compensa con región etiquetada, foco inicial explícito, `F6` para
saltar entre regiones y `Esc` para cerrar. Por debajo de 1280 px no caben
lista y conversación legibles a la vez, así que se mantiene el Sheet modal.

**Bug real encontrado al verificar visualmente a 1280 px** (el mínimo del
propio umbral, y el viewport por defecto de Playwright): incluso con la
sidebar ya contraída automáticamente, el nombre del Contact en la fila de
`InboxRow` podía colapsar a **0 px de ancho** y desaparecer del todo — la
señal más importante de la fila (INBOX.md: "en menos de 3 segundos... quién
necesita atención"), invisible. Causa: el nombre no tenía `flex-1`, así que
en flexbox su tamaño mínimo automático es `0` (por llevar `truncate`, que
fija `overflow: hidden`); el resto de la fila (badge, delegado, hora) usa
`shrink-0`, así que absorbía todo el ancho antes de dejarle nada al
nombre. Y el nombre del delegado se ocultaba solo por `sm:` (breakpoint de
**viewport**, 640 px) — irrelevante aquí, porque lo que se estrecha es la
*columna* de la lista al abrir el panel, no la ventana del navegador.
Corregido en `src/app/(app)/inbox/inbox-row.tsx`: `min-w-0 flex-1` en el
nombre (reclama espacio primero) y el delegado pasa a un breakpoint de
**contenedor** de Tailwind v4 (`@container` en el envoltorio de la lista,
`@sm:inline` en vez de `sm:inline` — subido a `@lg:inline` el 2026-09-28, cuando la columna del menú de producto estrechó la lista a ~400 px en 1280), además de un `max-w-24` para que un
nombre de delegado largo no pueda por sí solo desplazar al nombre del
Contact otra vez.

**Bug real encontrado en producción (staging) tras el despliegue de UI-6**:
el historial de mensajes se solapaba visualmente con el footer/compositor
en cuanto la conversación tenía suficientes mensajes — en concreto, con la
ventana de servicio cerrada, el último mensaje aparecía flotando encima del
`Alert` de "No puedes responder en texto libre ahora mismo", y en algunos
anchos el compositor no llegaba a verse. Causa: el `<div className="relative
min-h-0 flex-1">` que envuelve `SheetBody` en `conversation-thread.tsx` no
era un contenedor flex (`display: flex` ausente) — sin esto, la clase
`flex-1` de `SheetBody` no hace nada (las propiedades flex solo aplican a
*items* flex, no a hijos de un `div` normal), así que `SheetBody` crecía a
la altura de su contenido en vez de recortarse al espacio realmente
disponible, y ese contenido desbordado se solapaba visualmente con el
`SheetFooter` de después (dos hermanos en flujo normal, ninguno con
`position` no-estático — el desbordamiento de uno pisaba al otro sin que
ningún `overflow: hidden` lo evitara). Corregido añadiendo `flex flex-col`
al envoltorio, para que `SheetBody` reciba de verdad el alto que le
corresponde y su `overflow-y-auto` actúe.

Aprovechando la misma verificación: el modo anclado nunca reproducía la
animación de entrada (`animate-slide-in-right`) al abrir una conversación
por primera vez — a diferencia del modal, no hay ningún `Dialog` de Radix
que la dispare vía `data-[state=open]`. Se añadió la clase directamente al
`<aside>`; al no depender de ningún atributo, solo se reproduce en el
montaje (abrir por primera vez), tal como se pretendía.

**Pendiente de reproducir**: un informe de un panel duplicado/lado a lado
al cambiar de vista (p. ej. "Pendientes" → "Sin identificar") con una
conversación abierta. No se ha conseguido reproducir tras probar cambio de
vista simple, clics rápidos por varias vistas, doble/triple clic sobre la
misma vista, y carga directa seguida de cambio de vista — todas en verde
tanto en desarrollo como contra `next build && next start`. Si vuelve a
aparecer, anotar aquí los pasos exactos (¿doble navegador/pestaña?,
¿conexión lenta?, ¿justo tras un despliegue en frío?) para poder
reproducirlo de forma fiable.

## 6. Reutilización

`ConversationSheet` es un componente único: lo usan el Inbox y, en el
futuro, la ficha de Contacto y de Caso ("Conversaciones" → abre el mismo
Sheet). La lógica de `conversation-thread.tsx` (optimista, sondeo,
reintento, "escribiendo…") se conserva tal cual; solo cambia la
presentación.
