# INBOX.md — Diseño operativo de la bandeja

Objetivo: que en **menos de 3 segundos** el usuario sepa quién necesita
atención, qué está pendiente y qué ha pasado recientemente, y que pueda
trabajar una conversación **sin perder la lista**. Productividad por encima
de estética.

## 1. Datos reales disponibles (no inventar estados)

Del dominio actual (`src/modules/conversations`):

| Señal | Origen | Significado en UI |
|---|---|---|
| No leída | `lastReadAt` < último mensaje | Punto (`bg-primary`) + negrita en el nombre y la hora. **Sin `CountBadge`**: el dominio no cuenta mensajes no leídos, solo `boolean` (§ corrección más abajo) |
| **Pendiente de respuesta** | Último mensaje `INBOUND` | Derivado: el contacto habló el último. Es la señal principal de "necesita atención" |
| Sin identificar | `contact.isUnassigned` | `Badge tone="warning"` "Sin identificar" |
| Ventana de servicio | `getConversationServiceWindow` | Cerrada → icono + texto "Ventana cerrada"; < 2 h → "Cierra en 1 h" (warning). **Diferido en la fila de lista** (§ corrección más abajo); sigue mostrándose en la conversación (`CHAT.md`) |
| Canal | `conversation.channel` | Icono del canal en el avatar (+ nombre accesible) |
| Delegado | `delegateId` | Solo visible para ADMIN (el DELEGATE solo ve las suyas) |
| Último mensaje | `lastMessage` | Preview de 1 línea; si es saliente, prefijo "Tú:" |

**No existen hoy** (no se muestran ni se simulan): asignación a otra
persona, archivado, etiquetas, prioridad, SLA. Si se añaden al dominio,
este documento define dónde van (§4).

**Correcciones de implementación (Fase 5, cierre):**

- **Sin `CountBadge` en la fila.** El dominio solo guarda
  `conversations.lastReadAt` y compara contra el último mensaje
  (`isConversationUnread`, `src/modules/conversations/domain.ts`) — no hay
  un contador de mensajes no leídos por conversación. Mostrar un número
  inventado (p.ej. "2") sería un dato falso. La fila usa un punto simple
  (`InboxRow`, `src/app/(app)/inbox/inbox-row.tsx`); si el dominio llega a
  contar mensajes no leídos, aquí es donde se añade el `CountBadge`.
- **Indicador de ventana de servicio diferido en la lista.** Calcularlo por
  fila requeriría, además del `LEFT JOIN LATERAL` del último mensaje, un
  segundo lateral (último mensaje `INBOUND`) más una consulta a las
  capacidades del adapter por canal — cara de repetir para cada fila de una
  lista que ya sondea cada 5 s. Se mantiene en `ConversationThread` (una
  sola conversación abierta), no en la lista. Revisar si esto importa
  cuando el número de conversaciones por canal con ventana crezca.
- **Consulta de servidor resuelta.** `listConversationsWithPreview` usa
  `LEFT JOIN LATERAL` para el último mensaje por conversación (una consulta,
  no N+1); `countConversationsByView` cuenta cada vista en paralelo. Ver
  `src/modules/conversations/service.ts`.

## 2. Layout

```text
┌ Conversaciones ───────────────────────────────────────────────────────────┐
│ Todas las conversaciones de tus canales conectados, la más reciente primero│
│ [🔍 Buscar nombre, teléfono o mensaje] [Todas (12) ▾] [Canal ▾] [Delegado ▾]│
│ ─────────────────────────────────────────────────────────────────────────  │
│ (AL)ᵂ ● Ada Lovelace  [Sin identificar]                            10:42    │
│       Necesito ayuda con mi caso…                                           │
│ (GH)ᵀ   Grace Hopper                                               ayer     │
│       Tú: Te envío el borrador mañana                          ✓✓           │
└─────────────────────────────────────────────────────────────────────────────┘
                                          Sheet de conversación → CHAT.md
```

- **Una sola lista, como WhatsApp** (decisión del usuario, 2026-09-28): la
  página se llama **"Conversaciones"** (antes "Inbox"; la URL sigue siendo
  `/inbox`) y muestra todas las conversaciones en un listado; al hacer
  clic se abre la conversación en el panel. No hay menú lateral de
  vistas — el `ProductMenu` que tuvo durante unas horas queda para
  páginas con subsecciones reales (Organización, UI-7).
- `PageContainer size="full"`; la lista ocupa el ancho disponible; la
  conversación se abre en `Sheet` a la derecha (`CHAT.md`), la lista
  sigue ahí debajo.
- **Vistas como filtro** ("Mostrar", desplegable en el `FilterBar`, por
  `searchParams` `?view=`): **Todas** (por defecto), No leídas,
  Pendientes de respuesta (último mensaje entrante), Sin identificar —
  cada opción con su contador.
- **No leídas**: punto verde (`bg-primary`) y nombre en negrita. Se
  apaga en cuanto se abre la conversación, sin esperar al siguiente
  sondeo de la lista (`InboxList`, estado `readUpTo`).
- **Orden**: último mensaje, entrante o saliente — responder sube la
  conversación arriba. Las conversaciones sin mensajes van al final
  (`coalesce` con la fecha de creación: en PostgreSQL un `DESC` a secas
  pone los `NULL` primero).
- **Filtros** (FilterBar): búsqueda (nombre, teléfono, texto del último
  mensaje), canal, delegado (solo ADMIN). Todo en la URL: compartible y
  sobrevive al refresco. "Quitar filtros" cuando hay alguno.
- (Aplazado) En "Pendientes de respuesta", opción "Más antiguas primero"
  (quien lleva más tiempo esperando).

## 3. Fila de conversación (densidad)

Dos líneas, ~64 px, toda la fila es un enlace (`focus-inset`):

- Línea 1: avatar con icono de canal · **nombre** (negrita si no leída) ·
  badges (Sin identificar) · [ADMIN: delegado en `foreground-lighter`] ·
  hora relativa a la derecha (`RelativeTime`; `primary` y negrita si no
  leída).
- Línea 2: preview truncada (`foreground-lighter`; `foreground-light` si no
  leída) con "Tú:" y ticks (`DeliveryTicks`) si es saliente. Sin indicador de
  ventana de servicio (diferido, ver corrección en §1).
- Seleccionada (conversación abierta en el Sheet): `state-selected` +
  barra `primary` a la izquierda + `aria-current="true"` — **pendiente de
  Fase 6** (hoy la fila navega a `/inbox/[id]` a página completa, no hay
  Sheet todavía).
- Nombre accesible de la fila compuesto: "Ada Lovelace, WhatsApp, no
  leída, pendiente de respuesta, sin identificar, 10:42, Necesito ayuda…".
- Clase `font-semibold` en el nombre no leído: la usa hoy
  `tests/e2e/inbox.spec.ts`; si cambia, el spec se actualiza en el mismo
  commit (mejor: pasar a comprobar el texto accesible "no leída").

## 4. Acciones

- Sobre la fila (hover / foco, y menú `⋯`): Abrir, Marcar como leída / no
  leída (*requiere acción de servidor "no leída" — no existe*), Ver
  contacto.
- Globales en el aside: ninguna primaria hoy (no se inician conversaciones
  desde Kindly; sería una plantilla de WhatsApp, no disponible). No se
  inventa un "Nuevo mensaje".
- Futuro (si llega al dominio): asignar, archivar → menú de fila + atajo.

## 5. Teclado

| Tecla | Acción |
|---|---|
| `/` | Foco en búsqueda |
| `J` / `K` o `↓` / `↑` | Moverse entre filas (roving focus en `DataList`) |
| `Intro` | Abrir la conversación en el Sheet |
| `Esc` | Cerrar el Sheet (el foco vuelve a la fila) / limpiar búsqueda |
| `F6` / `Ctrl+F6` (modo anclado) | Saltar entre la lista y la conversación |
| `Alt+↓` / `Alt+↑` (con Sheet abierto) | Siguiente / anterior conversación sin cerrar |

Los atajos de una letra no se activan si el foco está en un campo de
texto. Una ayuda "Atajos de teclado" (`?`) los lista.

## 6. Tiempo real y estados

- Sondeo cada 5 s mientras la pestaña está visible, ahora en el cliente
  (`InboxList`, `src/app/(app)/inbox/inbox-list.tsx`; reemplaza el antiguo
  `auto-refresh.tsx` de PKG-013, eliminado) — compara el orden de los IDs
  recibidos contra el actual: mismo orden → aplica en el sitio (previews,
  no leída); orden distinto → lo retiene y muestra un aviso
  "N conversaciones nuevas · Ver" en vez de mover filas bajo el cursor. Los
  contadores del filtro "Mostrar" sí se actualizan siempre, aunque el aviso siga
  pendiente de aceptar.
- Cargando: skeleton de 8 filas con la forma real. Vacío inicial:
  `EmptyState` "Todavía no hay conversaciones" + "Conectar canal" (si no
  hay canales) o explicación (si los hay). Sin resultados: `EmptyState
  inline` con la búsqueda citada y "Quitar filtros". Error de carga:
  `Alert` destructivo con "Reintentar".
- Región `aria-live="polite"` que anuncia "N conversaciones nuevas" (no
  cada sondeo).

## 7. Responsive

- `xl+`: lista; conversación **anclada sin velo** a
  la derecha, la lista sigue interactiva (`CHAT.md` §4).
- `lg`: lista; conversación en Sheet modal.
- `md`: vistas como `SegmentedControl` horizontal sobre la lista.
- `< md`: lista a ancho completo; filtros tras un botón "Filtros" (Sheet
  inferior); la conversación a pantalla completa (`CHAT.md`).
