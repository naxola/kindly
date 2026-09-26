# INBOX.md — Diseño operativo de la bandeja

Objetivo: que en **menos de 3 segundos** el usuario sepa quién necesita
atención, qué está pendiente y qué ha pasado recientemente, y que pueda
trabajar una conversación **sin perder la lista**. Productividad por encima
de estética.

## 1. Datos reales disponibles (no inventar estados)

Del dominio actual (`src/modules/conversations`):

| Señal | Origen | Significado en UI |
|---|---|---|
| No leída | `lastReadAt` < último mensaje | Negrita + punto + `CountBadge` |
| **Pendiente de respuesta** | Último mensaje `INBOUND` | Derivado: el contacto habló el último. Es la señal principal de "necesita atención" |
| Sin identificar | `contact.isUnassigned` | `Badge tone="warning"` "Sin identificar" |
| Ventana de servicio | `getConversationServiceWindow` | Cerrada → icono + texto "Ventana cerrada"; < 2 h → "Cierra en 1 h" (warning) |
| Canal | `conversation.channel` | Icono del canal en el avatar (+ nombre accesible) |
| Delegado | `delegateId` | Solo visible para ADMIN (el DELEGATE solo ve las suyas) |
| Último mensaje | `lastMessage` | Preview de 1 línea; si es saliente, prefijo "Tú:" |

**No existen hoy** (no se muestran ni se simulan): asignación a otra
persona, archivado, etiquetas, prioridad, SLA. Si se añaden al dominio,
este documento define dónde van (§4).

Dependencia técnica: `listConversationsWithPreview` carga todos los
mensajes para hallar el último. La búsqueda y los contadores por vista
requieren una consulta dedicada (último mensaje por conversación con
`DISTINCT ON` o columna desnormalizada) — tarea de servidor de la Fase 5.

## 2. Layout

```text
┌ ContextNav (lg+) ┬ Lista (w-inbox-list … flex-1) ─────────────────────────┐
│ BANDEJA          │ [🔍 Buscar nombre, teléfono o mensaje   /] [Canal ▾]   │
│ ● Pendientes  4  │ [Delegado ▾ (ADMIN)]                  Ordenar: Reciente│
│   No leídas   3  │ ───────────────────────────────────────────────────── │
│   Sin identif. 1 │ (AL)ᵂ Ada Lovelace  [Sin identificar]        10:42  ● │
│   Todas          │      Necesito ayuda con mi caso…                    2  │
│                  │ (GH)ᵀ Grace Hopper                           ayer     │
│                  │      Tú: Te envío el borrador mañana         ✓✓       │
└──────────────────┴────────────────────────────────────────────────────────┘
                                          Sheet de conversación → CHAT.md
```

- `PageContainer size="full"`; la lista ocupa el ancho disponible, con
  un ancho máximo de lectura; la conversación se abre en `Sheet` a la
  derecha (`CHAT.md`), la lista sigue ahí debajo.
- **Vistas** (ContextNav, por `searchParams` `?view=`): **Pendientes**
  (por defecto: último mensaje entrante), No leídas, Sin identificar,
  Todas. Cada una con contador. Es el orden de "quién necesita atención".
- **Filtros** (FilterBar): búsqueda (nombre, teléfono, texto del último
  mensaje), canal, delegado (solo ADMIN). Todo en la URL: compartible y
  sobrevive al refresco. "Quitar filtros" cuando hay alguno.
- **Orden**: por actividad reciente (defecto); en Pendientes, opción "Más
  antiguas primero" (quien lleva más tiempo esperando).

## 3. Fila de conversación (densidad)

Dos líneas, ~64 px, toda la fila es un enlace (`focus-inset`):

- Línea 1: avatar con icono de canal · **nombre** (negrita si no leída) ·
  badges (Sin identificar) · [ADMIN: delegado en `foreground-lighter`] ·
  hora relativa a la derecha (`RelativeTime`; `primary` y negrita si no
  leída).
- Línea 2: preview truncada (`foreground-lighter`; `foreground-light` si no
  leída) con "Tú:" y ticks si es saliente · a la derecha `CountBadge` o
  indicador de ventana.
- Seleccionada (conversación abierta en el Sheet): `state-selected` +
  barra `primary` a la izquierda + `aria-current="true"`.
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

- Sondeo cada 5 s mientras la pestaña está visible (`AutoRefresh`,
  PKG-013) — se mantiene. Una conversación que sube a la cima **no** mueve
  el foco del teclado; si el usuario está en mitad de la lista, un aviso
  "3 conversaciones nuevas · Ver" evita saltos bajo el cursor.
- Cargando: skeleton de 8 filas con la forma real. Vacío inicial:
  `EmptyState` "Todavía no hay conversaciones" + "Conectar canal" (si no
  hay canales) o explicación (si los hay). Sin resultados: `EmptyState
  inline` con la búsqueda citada y "Quitar filtros". Error de carga:
  `Alert` destructivo con "Reintentar".
- Región `aria-live="polite"` que anuncia "N conversaciones nuevas" (no
  cada sondeo).

## 7. Responsive

- `xl+`: ContextNav vertical + lista; conversación **anclada sin velo** a
  la derecha, la lista sigue interactiva (`CHAT.md` §4).
- `lg`: ContextNav vertical estrecho; Sheet ocupa más.
- `md`: vistas como `SegmentedControl` horizontal sobre la lista.
- `< md`: lista a ancho completo; filtros tras un botón "Filtros" (Sheet
  inferior); la conversación a pantalla completa (`CHAT.md`).
