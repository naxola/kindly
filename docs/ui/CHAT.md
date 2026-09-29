# CHAT.md — Conversación (WhatsApp / Telegram) en Sheet lateral

## 1. Decisión

Abrir una conversación desde el Inbox (o desde un Contacto) la muestra en
un **Sheet que entra desde la derecha**, dejando la pantalla de origen
debajo. Es el patrón de Supabase para "vistas detalladas sin perder el
contexto" (`ui-patterns/modality`: Sheet para vistas detalladas, derecha
por defecto).

### Arquitectura: estado en la URL + caché cliente (2026-09-29)

**Supersede el diseño de UI-6** (rutas paralelas `@sheet` + interceptadas
`(.)[id]`) y una primera versión intermedia del mismo día (panel en
cliente pero con `/inbox/<id>` como ruta y lista/filtros aún ligados al
servidor) — detalle en `docs/DECISIONS.md` ("Inbox con estado en la URL y
caché cliente").

```text
/inbox?view=unread&search=ana&conversation=<id>
        └──── filtros de la lista ────┘ └── conversación abierta ──┘

src/app/(app)/inbox/
  page.tsx                          → única carga de servidor: siembra la caché (hidratación) y pinta
  [id]/page.tsx                     → redirección de enlaces antiguos /inbox/<id> → ?conversation=<id>
  inbox-workspace.tsx               → estado (URL), apertura/cierre, precarga; lista + panel
  inbox-list.tsx                    → consulta de la lista por filtros (refresco cada 5 s)
  [id]/conversation-panel.tsx       → el panel (siempre montado)
  inbox-filters.ts / inbox-queries.ts → URL ↔ filtros; claves y fetchers de TanStack Query
src/app/api/inbox/route.ts                        → la lista por filtros (JSON)
src/app/api/conversations/[id]/workspace/route.ts → chat + ficha de una conversación (JSON)
src/components/providers/query-provider.tsx       → QueryClient del área autenticada
```

- **Todo el estado de la pantalla está en el query string**, y cambiarlo
  nunca vuelve a pedir la página al servidor: abrir/cambiar/cerrar
  conversación y filtrar son `window.history.pushState`/`replaceState` (API
  nativa integrada oficialmente con `useSearchParams` —
  `node_modules/next/dist/docs/01-app/01-getting-started/04-linking-and-navigating.md`,
  "Native History API"). Atrás/Adelante los restaura Next desde la propia
  entrada del historial. Escribir en el buscador reemplaza la entrada en
  vez de apilar una por pulsación. La URL es enlazable y recargable.
- **Datos: TanStack Query.** La lista es una consulta por combinación de
  filtros, refrescada por detrás cada 5 s; cada conversación (chat +
  ficha) es otra, precargada al pasar el ratón o el foco por la fila y
  reutilizada al reabrirla. La precarga nunca marca como leída; lo hace el
  primer sondeo del hilo al abrirla (o la carga directa en servidor).
  Tras una mutación (marcar identificado, reasignar, enviar) se invalidan
  las consultas afectadas en vez de re-renderizar la página.
- **Primera carga** (o recarga): `page.tsx` resuelve en servidor
  exactamente la lista de esos filtros y, si hay `?conversation=`, esa
  conversación (marcándola leída), y los entrega como estado inicial de
  la caché — primer pintado completo, sin esqueletos.
- **Errores**: lista o conversación que no cargan por red muestran
  "Reintentar" (dos reintentos automáticos antes; nunca en un 4xx). Una
  conversación inexistente o sin permiso: `EmptyState`.

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
- **Futuro copiloto** (Fase 8 del producto; diseño detallado en
  `CONVERSATION_WORKSPACE.md`, paquete UI-10e todavía sin empezar): panel
  colapsable entre historial y compositor con el borrador en
  `font-document`, fuentes, vigencia y `EvidenceLevel`; "Usar borrador" solo
  **rellena** el compositor. Nunca un botón que envíe la sugerencia
  (`CLAUDE.md` §2).
- **Ficha del afiliado** (UI-10a, hecho el 2026-09-29, detalle completo en
  `CONVERSATION_WORKSPACE.md`): segunda columna del mismo panel en modo
  anclado, plegable; pestaña "Ficha" junto a "Chat" por debajo de `xl`. No
  es un panel aparte — abrir/cerrar la conversación sigue siendo una sola
  animación, un solo cierre.

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

**Estado real (2026-09-29, §1):**

- *Cargando la conversación*: si los datos no estaban ya en caché (lo
  normal es que sí, por la precarga), el panel abre igualmente al instante
  con esqueleto de cabecera, burbujas y ficha, y se rellena al llegar.
- *No encontrada / sin permiso*: `EmptyState` "Esta conversación no
  existe o no tienes acceso", también en carga directa (`?conversation=`
  de otra organización o inexistente).
- *Error al cargar* (red/500): `Alert` destructivo "No se pudo cargar la
  conversación" + "Reintentar", tras dos reintentos automáticos.

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

- En anclado, **un único `<aside>` siempre montado** cuyo `width`
  transiciona (`--duration-slow`, `ease-emphasized`) entre tres estados:
  cerrado (`0`), solo chat, chat + ficha. Abrir, cerrar y plegar/desplegar
  la ficha son la misma transición en ambos sentidos, y la lista (hermano
  `flex-1`) la sigue frame a frame sin código propio. Las columnas de
  dentro tienen ancho fijo y el panel `overflow-hidden`: se deslizan por el
  borde en vez de comprimirse (al plegar, el chat se desplaza a la derecha
  y la ficha sale por el borde). Cambiar de conversación **no** anima.
  El panel empieza a moverse ~30 ms después del clic (medido), sin esperar
  datos: si no estaban precargados, abre con esqueleto. Modal/pantalla
  completa: `Sheet` de Radix controlado, con su propia animación de
  entrada y salida.
- Al cerrar, el foco vuelve a la fila de la lista que lo abrió.
- Anchura en anclado: `--sheet-w-sm` (384 px) en `xl`, `--sheet-w-md`
  (560 px) en `2xl+` para la columna del chat; con la ficha visible (UI-10a)
  se suma `--workspace-context-w` (340px) como segunda columna del mismo
  panel — plegarla no reduce el chat, solo el panel entero. El modal usa
  `--sheet-w-md`. La lista ocupa el resto. **Abrir el panel nunca toca la
  sidebar global** (decisión del
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

**Reproducido y corregido (2026-09-28, PKG-014)**: no era cambiar de
*vista*, era volver a hacer clic en la **misma fila** de una conversación
ya abierta — un patrón distinto al probado aquí originalmente. La fila es
un `<Link href="/inbox/<id>">` sin más; al hacer clic estando ya en esa
URL, el router de Next no lo trata como el no-op que sería un enlace
normal a la página actual — para esta ruta interceptada/paralela resolvía
los *slots* de forma distinta la segunda vez, dejando caer la lista
entera (no duplicando el panel, como decía el informe original — el
síntoma real era el panel solo, pegado al borde izquierdo, sin lista al
lado). Corregido en `DataList`
(`src/components/ui/data-list.tsx`), no en Inbox: una fila ya seleccionada
bloquea la navegación en su propio `onClick`
(`event.preventDefault()` cuando `selected` es `true`), así que el clic
nunca llega a iniciar esa navegación redundante — arregla la clase
entera de fallo sin necesitar entender el porqué exacto de cómo Next
resuelve los *slots* la segunda vez. Test de regresión:
`tests/e2e/inbox.spec.ts::"re-clicking the already-open conversation
keeps the list next to the panel"`. Detalle completo en
`docs/DECISIONS.md` (entrada del 2026-09-28, "Fix: migración pendiente en
staging + panel roto...").

**Reportado por el usuario (2026-09-29), tras UI-10a, en cuatro rondas**:
la lista "tintineaba" al abrir una conversación; dos arreglos sucesivos
de CSS/animación (reservar el ancho de la lista al clic; hacer crecer el
panel con `@starting-style`) mejoraron el síntoma pero no la causa, que
era de arquitectura: abrir y cerrar eran **navegaciones de servidor**
(rutas paralelas/interceptadas), así que nada podía empezar a moverse
antes del viaje de ida y vuelta, cerrar desmontaba el panel sin
transición de salida, y plegar la ficha la desmontaba al instante. La
tercera ronda puso el panel en cliente, siempre montado; la cuarta llevó
también la lista y los filtros a estado en la URL + caché cliente (§1),
de modo que nada del Inbox vuelve al servidor tras la primera carga.
Tests de regresión en `tests/e2e/conversation-workspace.spec.ts`:
transición real en ambos sentidos con la lista moviéndose al unísono (suma
de anchos constante en cada frame), plegar desplaza el chat,
abrir/cerrar/Atrás/filtrar sin ninguna navegación de servidor ni remonte
de la lista (el buscador conserva el foco), y "Reintentar" tras un fallo
de red. Detalle en
`docs/DECISIONS.md`.

## 6. Reutilización

`ConversationPanel` (antes `ConversationSheet`) es un componente único: lo usan el Inbox y, en el
futuro, la ficha de Contacto y de Caso ("Conversaciones" → abre el mismo
Sheet). La lógica de `conversation-thread.tsx` (optimista, sondeo,
reintento, "escribiendo…") se conserva tal cual; solo cambia la
presentación.
