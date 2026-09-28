# CONVERSATION_WORKSPACE.md — Espacio de respuesta (Fase UI-10)

Conversación + ficha del afiliado + copiloto, en un único panel. Fase
**planificada, sin código todavía** (encargo del usuario del 2026-09-28:
"crea una fase con todo lo comentado para desarrollarlo a posteriori").

- **Mockup visual (datos ficticios):**
  `docs/ui/mockups/conversation-workspace.html` — publicado también como
  artifact privado del usuario: https://claude.ai/artifact/2bPa1bdSSay75RmSnmNbTU.
  Es una referencia visual, no código de producto: valores copiados de
  `src/styles/tokens.css`, sin componentes reales.
- Depende de `CHAT.md` (el panel actual) e `INBOX.md` (la lista), que
  siguen siendo la fuente de verdad de lo que no se redefine aquí.

## 1. Decisiones ya tomadas por el usuario (2026-09-28)

1. **Un único panel con dos columnas**, no dos paneles independientes: al
   hacer clic en una conversación (en **toda la fila**, no solo en el
   texto del último mensaje) se desliza desde la derecha **un** panel con
   el chat a la izquierda y la **ficha del afiliado** a la derecha. Un solo
   cierre, un solo `Esc`, una sola animación de entrada. La lista sigue
   visible (más estrecha) para saltar de un afiliado a otro.
2. **Ficha de solo lectura** en la primera versión: primero se valida el
   aspecto; la edición (notas, crear tarea/caso) es un paquete posterior.
3. **Contenido de la ficha**: lo que ya existe en el sistema (contacto,
   delegado, identificación, notas, casos, tareas, otras conversaciones)
   **más**: estado de la **afiliación** (activa o no, y desde cuándo —
   importante para promover la afiliación), **número de afiliado**,
   **documentación aportada** (llegada por WhatsApp o email, y también la
   enviada por el delegado) y un **resumen contextual** de las
   conversaciones previas.
4. **Copiloto dinámico** dentro de la conversación: ayuda que se actualiza
   según fluye la conversación. No tiene por qué copiar la tarjeta del
   sitio público (`src/app/(public)/page.tsx`); el mockup propone una
   versión.

## 2. Layout

```text
┌ Sidebar ┬ Lista (estrecha) ┬─────────── Panel (slide-in-right) ────────────┐
│         │ ● Marta Ruiz     │ Chat                        │ Ficha      [⇥]  │
│         │   Javier López   │  historial…                 │ Afiliación      │
│         │   …              │ ┌ Copiloto ───────────────┐ │ Contacto        │
│         │                  │ │ detectado · borrador …  │ │ Situación (IA)  │
│         │                  │ └─────────────────────────┘ │ Documentación   │
│         │                  │ [Escribe una respuesta…]    │ Casos · Tareas  │
└─────────┴──────────────────┴─────────────────────────────┴─────────────────┘
```

- **Anchuras** (tokens nuevos, a crear en `tokens.css` y `TOKENS.md`):
  `--workspace-context-w` ≈ 340 px para la ficha. El chat mantiene su
  regla actual (`--sheet-w-sm` en `xl`, `--sheet-w-md` en `2xl+`, ver
  `CHAT.md` §4); el panel completo = chat + ficha.
- **Responsive**:
  - `2xl+` (≥ 1536 px): chat + ficha abiertos por defecto, lista al lado.
  - `xl` (1280–1535 px): no cabe todo holgado → ficha **plegable** con un
    botón en el header del panel (icono de panel lateral,
    `aria-pressed`); la preferencia se recuerda (cookie, como la de la
    sidebar: `sidebar-cookie.ts`), nunca se pliega sola la sidebar global
    (decisión del 2026-09-28 en `docs/DECISIONS.md`).
  - `< xl` (Sheet modal / pantalla completa): la ficha pasa a una
    **pestaña** "Chat" / "Ficha" dentro del panel (`Tabs`, no cambia la URL).
- **Accesibilidad**: la ficha es `<aside aria-label="Ficha del afiliado">`
  dentro del panel; `F6` recorre lista → chat → ficha (extiende el
  `F6`/`Ctrl+F6` actual de `CHAT.md` §4). El copiloto es su propia región
  con encabezado; los cambios de sugerencia se anuncian con
  `aria-live="polite"` sin robar el foco del compositor.

## 3. Ficha del afiliado — secciones y de dónde sale cada dato

| Sección | Contenido | Fuente | ¿Existe hoy? |
|---|---|---|---|
| **Afiliación** | Activa / no activa, número de afiliado, desde cuándo (y hasta cuándo si causó baja). Si no está activa: aviso ámbar "buen momento para proponer la afiliación" — **regla fija**, no sugerencia de IA | Entidad nueva (§5.1) | ❌ |
| Contacto | Teléfono, email, canal, delegado, notas | `contacts`, `messaging_accounts` | ✅ |
| Identificación | "Sin identificar" + "Marcar como identificado" / "Reasignar" (hoy en un `Alert` sobre el chat; se mueve aquí) | `contacts.is_unassigned` | ✅ (acciones ya existen; se mueven) |
| **Situación (resumen IA)** | 3-5 líneas sobre la situación actual a partir de las conversaciones previas, con etiqueta "IA", fecha de generación, nº de conversaciones/mensajes y enlace "ver en qué mensajes se basa" | Paquete UI-10d (§5.3) | ❌ |
| **Documentación aportada** | Archivos recibidos y enviados, con canal (WhatsApp/email), fecha y estado (recibido, enviado, **falta** si se pidió y no llegó) | Paquete UI-10c (§5.2) | ❌ |
| Casos abiertos | Título, estado, responsable | `cases` | ✅ |
| Tareas pendientes | Título, vencimiento | `tasks` | ✅ |
| Otras conversaciones | Del mismo Contact en otros canales (email en el futuro) | `conversations` | ✅ |

"Falta" en documentación necesita saber qué se pidió: en v1 solo se
muestra lo recibido/enviado; lo pendiente llega con el copiloto (que lo
detecta en "Falta por saber") o con una lista de documentos por tipo de
Caso — **pregunta abierta** (§7).

## 4. Copiloto dinámico

Implementa el AI Copilot de `docs/PRODUCT.md` §10 y la Fase 8 de
`project/TASKS.md` en esta superficie.

- **Posición**: tarjeta entre el historial y el compositor (lo previsto en
  `CHAT.md` §2), no en la ficha — la sugerencia está donde se escribe.
  Plegable (queda una línea: "Copiloto · Actualizado 10:42 · Evidencia
  parcial"); con altura máxima y scroll propio para no tapar el historial.
- **Dinámico**: se recalcula en segundo plano (job, `pg-boss`) cuando
  entra un mensaje del Contact, no en cada tecla; la tarjeta muestra
  "Actualizado con el mensaje de las HH:MM". Si llega un mensaje nuevo
  mientras el delegado lee la sugerencia, **no** se sustituye bajo sus
  ojos: aviso "Hay una sugerencia nueva — Ver" (mismo criterio que la
  lista, `INBOX.md` §6).
- **Contenido** (`AISuggestion`, `docs/DATABASE.md`): qué ha detectado
  (`issue`), respuesta propuesta (`suggestedReply`, en `font-document`),
  en qué se apoya (`sources`: documento, versión, artículo, **vigencia**),
  `EvidenceLevel` (`SUFFICIENT`/`PARTIAL`/`INSUFFICIENT`, nunca un
  porcentaje), avisos (`warnings`), falta por saber
  (`missingInformation`).
- **Acciones**: **"Usar como borrador"** solo rellena el compositor (el
  delegado edita y pulsa Enviar); "Descartar". **Nunca** un botón que
  envíe la sugerencia (`CLAUDE.md` §2). Nota fija: "Nada se envía sin que
  lo revises tú". La tarjeta pública dice "Editar y enviar"; aquí se usa
  "Usar como borrador" por ser más exacto.
- **Estados**: generando (skeleton + "Analizando la conversación…"), sin
  sugerencia (mensaje trivial: "Nada que sugerir para este mensaje"),
  evidencia insuficiente (se muestra igualmente, con el nivel en rojo y sin
  borrador si no hay base), error (una línea, "Reintentar"), ventana de
  servicio cerrada (la sugerencia se muestra, pero "Usar como borrador"
  explica por qué no se puede enviar ahora).
- **Normativa verificable** (`CLAUDE.md` §2.3): sin fuente recuperada real,
  no hay cita; nunca se inventa artículo, fecha ni versión.
- **Auditoría**: qué recibió, qué recuperó, qué generó y qué hizo el
  delegado (usó, editó, descartó), con retención explícita (Fase 8).

## 5. Dominio nuevo que requiere (por paquete)

### 5.1 Afiliación (UI-10b)

Entidad `Membership` ligada a `Contact` (no columnas sueltas en
`contacts`: una persona puede darse de baja y volver, y el histórico
importa para "desde cuándo"). Campos mínimos: `organization_id`,
`contact_id`, `member_number`, `status` (`ACTIVE`/`INACTIVE`),
`started_at`, `ended_at` (nullable). Única activa por Contact. Tests de
aislamiento por `organization_id`. **Pregunta abierta**: de dónde llegan
estos datos (§7) — decide si hay alta manual, importación CSV o
integración con otro sistema.

### 5.2 Documentación / adjuntos (UI-10c)

Absorbe el pendiente "imágenes entrantes" de `project/CURRENT_TASK.md`.
Entidad `MessageAttachment` (tipo, mime, tamaño, nombre, referencia de
storage S3-compatible/R2, dirección) ligada a `Message`; la ficha lista
los adjuntos de todas las conversaciones del Contact. WhatsApp: el webhook
trae un `media_id`, hay que descargarlo con una llamada autenticada a la
Graph API (confirmar en la documentación **actual** de Meta antes de
construir, `CLAUDE.md` §3). Email entrante: no existe todavía (solo envío
con Resend) — hasta entonces la ficha muestra solo WhatsApp.
**Seguridad y RGPD**: validación de tipo/tamaño/contenido (`CLAUDE.md`
§5); URLs firmadas de corta duración; acceso solo dentro de la
Organization. Un parte de baja es **dato de salud** (categoría especial,
art. 9 RGPD): política de retención y revisión jurídica antes de
producción.

### 5.3 Resumen de situación (UI-10d)

Necesita `LLMProvider` (Fase 8). Se genera en segundo plano al cerrar un
intercambio o al abrir la conversación si está desactualizado; se guarda
con fecha y los ids de los mensajes usados (para "ver en qué mensajes se
basa"). No contiene afirmaciones normativas (eso es del copiloto, con
fuentes). Los datos del cliente no se usan para entrenar modelos
(`CLAUDE.md` §5).

### 5.4 Copiloto (UI-10e)

Necesita Fase 7 (Knowledge: documentos versionados, recuperación con
filtros de tenancy/vigencia) y Fase 8 (AI). Sin conocimiento cargado, el
copiloto puede funcionar solo con contexto de la conversación y la ficha,
pero **sin citar** — y con `EvidenceLevel` acorde.

## 6. Paquetes

| Paquete | Alcance | Depende de |
|---|---|---|
| **UI-10a** | Panel de dos columnas + ficha de solo lectura con los datos que ya existen (contacto, identificación movida del `Alert`, notas, casos, tareas, otras conversaciones); plegar ficha con preferencia recordada; pestañas por debajo de `xl`; tokens nuevos; E2E camino feliz | Nada — se puede empezar ya |
| **UI-10b** | `Membership` (dominio, migración, servicio, tests) + sección Afiliación + aviso de afiliación inactiva | Respuesta a §7.1 |
| **UI-10c** | Adjuntos WhatsApp (descarga, storage, `MessageAttachment`), miniatura en la burbuja + visor, sección Documentación | Confirmar API de medios de Meta; storage R2 configurado |
| **UI-10d** | Resumen de situación | Fase 8 (`LLMProvider`) |
| **UI-10e** | Copiloto dinámico en la conversación | Fases 7 y 8 |
| **UI-10f** | Ficha editable (notas, crear tarea/caso desde la conversación) | Validación visual de UI-10a por el usuario |

Cada paquete cumple la Definition of Done de `CLAUDE.md` §6.

## 7. Preguntas abiertas (para el usuario, antes de UI-10b/c)

1. **Origen de los datos de afiliación**: ¿se dan de alta a mano en Kindly,
   se importan (CSV/Excel) o vienen de otro sistema de la organización?
   ¿Hay más estados que activa/baja (p. ej. impago, suspendida)?
2. **Documentación "que falta"**: ¿hay una lista de documentos esperados
   por tipo de trámite/caso, o basta con lo que detecte el copiloto?
3. **Quién ve la documentación**: ¿cualquier miembro de la Organization o
   solo el delegado del Contact y los ADMIN? (datos de salud).

## 8. Criterios de aceptación de la fase

- Abrir una conversación abre chat + ficha en una sola animación; la
  sidebar global nunca cambia; cerrar lo cierra todo.
- Ninguna acción del copiloto envía nada; E2E que lo comprueba (el único
  camino a enviar es el botón Enviar del compositor).
- Toda cita del copiloto enlaza a un `DocumentVersion` real con vigencia.
- Aislamiento multi-tenant probado para `Membership`, adjuntos y
  resúmenes.
- Captura visual real a 1280, 1536 y 1920 px y en móvil, comparada con el
  mockup.
