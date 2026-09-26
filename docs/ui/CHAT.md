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
  layout.tsx              → renderiza {children} + {sheet}
  page.tsx                → lista
  @sheet/default.tsx      → null
  @sheet/(.)[id]/page.tsx → <ConversationSheet id> (navegación suave desde /inbox)
  [id]/page.tsx           → carga directa / refresco: lista + Sheet abierto
```

- La URL sigue siendo `/inbox/<id>`: enlazable, recargable, con historial
  (Atrás cierra el Sheet).
- Carga directa de `/inbox/<id>`: se pinta la lista con el Sheet ya
  abierto (misma experiencia), no una página distinta.
- Cerrar = `router.back()` si se llegó por navegación suave; si no,
  `router.push('/inbox' + filtros actuales)`.
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
  secundaria (canal, teléfono, delegado para ADMIN). Acciones: anterior /
  siguiente conversación de la lista actual (`Alt+↑/↓`), menú `⋯` (Ver
  contacto, Vincular a caso — cuando exista en UI, Marcar como no leída —
  cuando exista en dominio), cerrar (`✕`, `aria-label="Cerrar
  conversación"`).
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
- **Futuro copiloto** (Fase 8 del producto): panel colapsable entre
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
- Anchura: `--sheet-w-md` (560 px) por defecto, `--sheet-w-lg` en `2xl`.
  En anclado, la lista ocupa el resto con un mínimo de `--inbox-list-w`;
  si no cabe (sidebar expandida en 1280 px), la sidebar se contrae
  automáticamente mientras el panel está abierto.
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

## 6. Reutilización

`ConversationSheet` es un componente único: lo usan el Inbox y, en el
futuro, la ficha de Contacto y de Caso ("Conversaciones" → abre el mismo
Sheet). La lógica de `conversation-thread.tsx` (optimista, sondeo,
reintento, "escribiendo…") se conserva tal cual; solo cambia la
presentación.
