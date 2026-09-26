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

- Apertura: `slide-in-right` (`--duration-slow`), velo `bg-overlay`
  `fade-in`. Cierre: `Esc`, clic en velo, `✕`, Atrás del navegador.
- **Modal** (focus trap): al abrir, el foco va al compositor si la
  ventana está abierta; si no, al título. Al cerrar, vuelve a la fila de
  la lista que lo abrió.
- Anchura: `size="md"` (`--sheet-w-md`, 560 px) por defecto; `lg` en
  pantallas `2xl`. Configurable por prop.
- `< md`: `w-full` (pantalla completa), header con "← Volver" en vez de
  `✕`, compositor pegado abajo respetando el teclado virtual
  (`100dvh`, `env(safe-area-inset-bottom)`).
- La lista del Inbox **sigue sondeando** debajo; el hilo sondea cada 3 s
  (PKG-013). Abrir marca como leída (regla actual).
- `aria-labelledby` = nombre del contacto; `aria-describedby` = línea
  secundaria. El historial es `role="log"` con `aria-live="polite"` para
  mensajes entrantes nuevos (no para el historial inicial).

## 5. Evaluado y aplazado: Sheet "anclado" no modal

En pantallas muy anchas (≥ 1536 px) se podría anclar el Sheet sin velo y
dejar la lista interactiva al lado (dos paneles). Es más productivo pero
rompe el modelo modal (focus trap) y complica la navegación por teclado
entre regiones. Se aplaza hasta validar la versión modal con uso real;
`Alt+↑/↓` cubre ya el caso "pasar a la siguiente sin cerrar".

## 6. Reutilización

`ConversationSheet` es un componente único: lo usan el Inbox y, en el
futuro, la ficha de Contacto y de Caso ("Conversaciones" → abre el mismo
Sheet). La lógica de `conversation-thread.tsx` (optimista, sondeo,
reintento, "escribiendo…") se conserva tal cual; solo cambia la
presentación.
